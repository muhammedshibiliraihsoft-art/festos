import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Award, Download, Play, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react-native';
import { toBlob } from 'html-to-image';
import { useGetPosterTemplates, useSaveGeneratedPoster } from '../../core/hooks/useLeaderboardSettings';
import { uploadService } from '../../services/storage/uploadService';

const colors = {
  navy: '#0B1F3A',
  blue: '#123B73',
  cyan: '#16B8D9',
  teal: '#0F766E',
  green: '#22C55E',
  bg: '#F3F8FB',
  card: '#FFFFFF',
  border: '#DDEAF1',
  text: '#0F172A',
  muted: '#64748B',
  soft: '#EAF7FA',
};

type LeaderboardStandingsRow = {
  organisation_name: string;
  total_points: number;
  result_count: number;
  first_place_count: number;
};

export default function PosterGenerationEngine({
  tenantId,
  festivalId,
  standings,
  posterTopCount = 3,
}: {
  tenantId: string;
  festivalId: string;
  standings: LeaderboardStandingsRow[];
  posterTopCount?: number;
}) {
  const { data: templates = [], isLoading: isTemplatesLoading } = useGetPosterTemplates(festivalId);
  const saveGeneratedPoster = useSaveGeneratedPoster();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [generatedPosters, setGeneratedPosters] = useState<{ name: string; url: string; blob: Blob; rank: number }[]>([]);

  // Hidden capture node reference
  const captureRef = useRef<HTMLDivElement | null>(null);

  // Dynamic template rendering state for capture
  const [currentRender, setCurrentRender] = useState<{
    title: string;
    unit_name: string;
    points: string;
    rank: string;
  } | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const addLog = (message: string) => {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Sleep utility to allow DOM to finish rendering
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleBulkGenerate = async () => {
    if (isGenerating) return;
    if (!selectedTemplate) {
      alert('Please select or upload a template first.');
      return;
    }

    const rowsToProcess = standings.slice(0, posterTopCount);
    if (rowsToProcess.length === 0) {
      alert('No standings data available for poster generation.');
      return;
    }

    setIsGenerating(true);
    setGeneratedPosters([]);
    setLog([]);
    setProgress({ current: 0, total: rowsToProcess.length });
    addLog(`Starting bulk generation for Top ${rowsToProcess.length} Units...`);

    try {
      for (let i = 0; i < rowsToProcess.length; i++) {
        const row = rowsToProcess[i];
        const rankIndex = i + 1;
        const rankSuffix = rankIndex === 1 ? 'st' : rankIndex === 2 ? 'nd' : rankIndex === 3 ? 'rd' : 'th';
        
        const renderData = {
          title: 'FESTOS',
          unit_name: row.organisation_name,
          points: `${row.total_points} Points`,
          rank: `RANK #${rankIndex}`,
        };

        setProgress({ current: i + 1, total: rowsToProcess.length });
        addLog(`Preparing poster for ${row.organisation_name} (${rankIndex}${rankSuffix} Place)...`);

        // Set the state for capture node rendering
        setCurrentRender(renderData);

        // Wait to allow React to update the DOM container
        await sleep(400);

        if (!captureRef.current) {
          throw new Error('Capture target DOM element was not initialized');
        }

        addLog(`Rendering canvas layer (${selectedTemplate.width}x${selectedTemplate.height}px)...`);
        
        // Ensure all custom fonts are fully loaded before rendering
        await document.fonts.ready;
        
        // Render target element directly to PNG blob
        const blob = await toBlob(captureRef.current, {
          width: selectedTemplate.width,
          height: selectedTemplate.height,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
          },
          cacheBust: true,
        });

        if (!blob) {
          throw new Error(`Failed to capture canvas render for ${row.organisation_name}`);
        }

        addLog(`Uploading generated poster to Cloudflare R2...`);
        const fileMetadata = await uploadService.uploadPoster(blob, festivalId, tenantId);

        addLog(`Saving snapshot metadata for audit verification...`);
        await saveGeneratedPoster.mutateAsync({
          tenant_id: tenantId,
          festival_id: festivalId,
          template_id: selectedTemplate.id!,
          template_version: selectedTemplate.version || 1,
          file_url: fileMetadata.file_url,
          object_key: fileMetadata.object_key,
          leaderboard_snapshot: {
            unit_name: row.organisation_name,
            points: row.total_points,
            rank: rankIndex,
            total_wins: row.first_place_count,
            timestamp: new Date().toISOString(),
          },
        });

        const localPreviewUrl = URL.createObjectURL(blob);
        setGeneratedPosters((prev) => [
          ...prev,
          { name: row.organisation_name, url: fileMetadata.file_url, blob, rank: rankIndex },
        ]);
        addLog(`✓ Successfully generated poster for ${row.organisation_name}!`);
      }

      addLog('🎉 Bulk poster generation finished successfully!');
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`);
      alert('Error generating posters: ' + err.message);
    } finally {
      setIsGenerating(false);
      setCurrentRender(null);
    }
  };

  const downloadPoster = (post: { name: string; blob: Blob; rank: number }) => {
    const safeFileName = `rank-${post.rank}-${post.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-poster.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(post.blob);
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    generatedPosters.forEach((post, idx) => {
      setTimeout(() => downloadPoster(post), idx * 400);
    });
  };

  if (isTemplatesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.cyan} />
        <Text style={styles.loadingText}>Configuring Poster Generation Engine...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hidden high-fidelity rendering target (rendered off-screen) */}
      {typeof window !== 'undefined' && selectedTemplate && currentRender && (
        <div
          ref={(el) => {
            captureRef.current = el;
          }}
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            width: `${selectedTemplate.width}px`,
            height: `${selectedTemplate.height}px`,
            backgroundImage: `url(${selectedTemplate.background_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            fontFamily: 'sans-serif',
            overflow: 'hidden',
          }}
        >
          {/* Render overlay fields styled dynamically based on field mappings */}
          {(['title', 'unit_name', 'points', 'rank'] as const).map((field) => {
            const config = selectedTemplate.field_mappings?.[field];
            if (!config) return null;

            return (
              <div
                key={field}
                style={{
                  position: 'absolute',
                  left: `${config.x}px`,
                  top: `${config.y}px`,
                  fontSize: `${config.fontSize}px`,
                  color: config.color,
                  textAlign: config.align,
                  maxWidth: `${config.maxWidth}px`,
                  transform: config.align === 'center' ? 'translateX(-50%)' : 'none',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                  textShadow: '0 2px 8px rgba(0,0,0,0.35)',
                }}
              >
                {currentRender[field]}
              </div>
            );
          })}
        </div>
      )}

      <View style={styles.header}>
        <Sparkles size={20} color={colors.cyan} />
        <Text style={styles.title}>Poster Generation Engine</Text>
      </View>
      <Text style={styles.subTitle}>
        Generate branded social media posters automatically for the top ranked units.
      </Text>

      <View style={styles.grid}>
        {/* Template Selector & Action */}
        <View style={styles.leftPane}>
          <Text style={styles.label}>Select Active Template</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tplRow}>
            {templates.length === 0 ? (
              <View style={styles.noTplCard}>
                <Text style={styles.noTplText}>No templates found. Please upload one above.</Text>
              </View>
            ) : (
              templates.map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  onPress={() => setSelectedTemplateId(tpl.id || null)}
                  style={[
                    styles.tplCard,
                    selectedTemplate?.id === tpl.id && styles.tplCardActive,
                  ]}
                >
                  <View style={styles.tplIcon}>
                    <Award size={18} color={selectedTemplate?.id === tpl.id ? '#FFFFFF' : colors.cyan} />
                  </View>
                  <Text style={[styles.tplName, selectedTemplate?.id === tpl.id && styles.tplNameActive]}>
                    {tpl.name}
                  </Text>
                  <Text style={[styles.tplDim, selectedTemplate?.id === tpl.id && styles.tplDimActive]}>
                    {tpl.aspect_ratio} ({tpl.width}x{tpl.height})
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Action Trigger */}
          <TouchableOpacity
            onPress={handleBulkGenerate}
            disabled={isGenerating || templates.length === 0}
            style={[
              styles.actionButton,
              (isGenerating || templates.length === 0) && { opacity: 0.6 },
            ]}
          >
            {isGenerating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Play size={18} color="#FFFFFF" />
            )}
            <Text style={styles.actionText}>
              {isGenerating
                ? `Generating ${progress.current}/${progress.total}...`
                : `Generate Top ${posterTopCount} Winner Posters`}
            </Text>
          </TouchableOpacity>

          {/* Progress bar */}
          {isGenerating && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${(progress.current / progress.total) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                Processing: {progress.current} of {progress.total} posters completed
              </Text>
            </View>
          )}
        </View>

        {/* Live Logs & Results */}
        <View style={styles.rightPane}>
          <Text style={styles.label}>Generation Output Logs</Text>
          <View style={styles.logBox}>
            <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
              {log.length === 0 ? (
                <Text style={styles.emptyLog}>Engine idle. Ready to generate.</Text>
              ) : (
                log.map((line, idx) => (
                  <Text key={idx} style={styles.logLine}>
                    {line}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>

          {generatedPosters.length > 0 && (
            <View style={styles.resultsWrap}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.label}>Ready Winner Posters ({generatedPosters.length})</Text>
                <TouchableOpacity onPress={downloadAll} style={styles.downloadAllBtn}>
                  <Download size={14} color="#FFFFFF" />
                  <Text style={styles.downloadAllText}>Download All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {generatedPosters.map((post, idx) => (
                  <View key={idx} style={styles.resultCard}>
                    {/* Rank Badge */}
                    <View style={[
                      styles.rankBadge,
                      { backgroundColor: idx === 0 ? '#FEF9C3' : idx === 1 ? '#F1F5F9' : '#FEF3C7' }
                    ]}>
                      <Text style={[
                        styles.rankText,
                        { color: idx === 0 ? '#CA8A04' : idx === 1 ? '#475569' : '#B45309' }
                      ]}>#{post.rank}</Text>
                    </View>

                    {/* Preview thumbnail (local blob URL) */}
                    {typeof window !== 'undefined' && (
                      <img
                        src={URL.createObjectURL(post.blob)}
                        alt={post.name}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #DDEAF1' }}
                      />
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{post.name}</Text>

                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {/* Direct Download */}
                        <TouchableOpacity
                          onPress={() => downloadPoster(post)}
                          style={styles.downloadBtn}
                        >
                          <Download size={12} color="#FFFFFF" />
                          <Text style={styles.downloadBtnText}>Download</Text>
                        </TouchableOpacity>

                        {/* View in new tab */}
                        <TouchableOpacity
                          onPress={() => window.open(post.url, '_blank')}
                          style={styles.viewBtn}
                        >
                          <Text style={styles.viewBtnText}>View R2</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginTop: 24,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Poppins_400Regular',
    color: colors.muted,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Poppins_900Black',
    fontSize: 20,
    color: colors.text,
  },
  subTitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    gap: 20,
    flexWrap: 'wrap',
  },
  leftPane: {
    flex: 1.2,
    minWidth: 320,
    gap: 14,
  },
  label: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: colors.text,
    marginBottom: 6,
  },
  tplRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  noTplCard: {
    padding: 20,
    backgroundColor: colors.bg,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  noTplText: {
    fontFamily: 'Poppins_400Regular',
    color: colors.muted,
    fontSize: 13,
  },
  tplCard: {
    width: 150,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    marginRight: 10,
  },
  tplCardActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.cyan,
  },
  tplIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tplName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: colors.text,
  },
  tplNameActive: {
    color: '#FFFFFF',
  },
  tplDim: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
    color: colors.muted,
  },
  tplDimActive: {
    color: '#EAF7FA',
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  progressContainer: {
    gap: 6,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.green,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: colors.muted,
  },
  rightPane: {
    flex: 1,
    minWidth: 320,
    gap: 14,
  },
  logBox: {
    height: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#0F172A',
  },
  emptyLog: {
    fontFamily: 'monospace',
    color: '#64748B',
    fontSize: 11,
  },
  logLine: {
    fontFamily: 'monospace',
    color: '#38BDF8',
    fontSize: 11,
    marginBottom: 4,
  },
  resultsWrap: {
    gap: 8,
  },
  resultList: {
    flexDirection: 'row',
    gap: 10,
  },
  resultCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
    width: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  resultName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    color: colors.text,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.teal,
  },
  downloadBtnText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  viewBtnText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 10,
    color: colors.muted,
  },
  downloadAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.navy,
  },
  downloadAllText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  rankText: {
    fontFamily: 'Poppins_900Black',
    fontSize: 12,
  },
});
