import { coreColor, coreAlpha } from '@/constants/coreTheme';
import { Modal } from '@/components/ui/CoreModal';
import { ui } from '@/constants/designSystem';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Platform, TextInput, Pressable } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Share2, Archive, Upload, Trash2, Plus } from 'lucide-react-native';
import { supabase } from '@/core/config/supabase';
import { useFestival } from '@/core/hooks/useFestival';
import { useExportQueueStore } from '@/services/exportQueueService';
import { storageService } from '@/services/storage/storageService';
import { uploadService } from '@/services/storage/uploadService';
import { useAuthStore } from '@/core/store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: coreColor('#0F766E', 'primary'),
  green: coreColor('#22C55E', 'success'),
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
  whatsapp: '#25D366'
};

const signedUrlCache = new Map<string, { url: string, expires: number }>();

export default function MediaCenterPage() {
  const { useActiveFestival } = useFestival();
  const { data: activeFestival } = useActiveFestival();
  const { jobs, isProcessing } = useExportQueueStore();
  const [filter, setFilter] = useState('all'); // 'all', 'poster', 'certificate'
  const queryClient = useQueryClient();
  const { tenant_id } = useAuthStore();

  // Upload poster states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadEventName, setUploadEventName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be under 10MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    };
    input.click();
  };

  const handleUploadPoster = async () => {
    if (!selectedFile || !uploadEventName.trim() || !activeFestival?.id || !tenant_id) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const metadata = await uploadService.uploadPoster(selectedFile, activeFestival.id, tenant_id, (p) => setUploadProgress(p));
      const renderHash = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const { error } = await supabase.from('generated_assets').insert({
        tenant_id,
        festival_id: activeFestival.id,
        asset_type: 'poster',
        render_hash: renderHash,
        resolution: 'hd',
        storage_path: metadata.object_key,
        public_url: metadata.file_url,
        event_name: uploadEventName.trim(),
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['generated-assets', activeFestival.id] });
      setShowUploadModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadEventName('');
      setUploadProgress(0);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePoster = async (asset: any) => {
    if (!activeFestival?.id) return;
    const confirmed = confirm(`Delete poster "${asset.event_name}"?`);
    if (!confirmed) return;
    try {
      const { error } = await supabase.from('generated_assets').delete().eq('render_hash', asset.render_hash);
      if (error) throw error;
      for (const res of Object.keys(asset.resolutions || {})) {
        const url = asset.resolutions[res];
        if (url && url.startsWith('r2://')) {
          try { await uploadService.deleteObject(url.replace('r2://', '')); } catch (_) {}
        }
      }
      queryClient.invalidateQueries({ queryKey: ['generated-assets', activeFestival.id] });
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const { data: assets = [], isLoading, refetch } = useQuery({
    queryKey: ['generated-assets', activeFestival?.id],
    queryFn: async () => {
      if (!activeFestival?.id) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select(`
          *,
          item:items(item_name_en, item_name_ml, item_type),
          result:results(public_result_no)
        `)
        .eq('festival_id', activeFestival.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Group by render_hash (null-safe — each null gets its own unique key)
      const grouped = (data as any[]).reduce((acc, curr, idx) => {
        const key = curr.render_hash || `_ungrouped_${idx}`;
        if (!acc[key]) {
          acc[key] = {
            id: curr.id,
            render_hash: key,
            template_id: curr.template_id,
            event_name: curr.event_name || curr.item?.item_name_en || curr.item?.item_name_ml || 'Festival Event',
            result_no: curr.result?.public_result_no,
            created_at: curr.created_at,
            resolutions: {}
          };
        }
        acc[key].resolutions[curr.resolution] = curr.public_url;
        return acc;
      }, {} as Record<string, any>);
      
      const resultAssets = Object.values(grouped) as any[];
      
      // Resolve r2:// URLs to presigned HTTP URLs
      for (const asset of resultAssets) {
        for (const res of Object.keys(asset.resolutions)) {
          let url = asset.resolutions[res];
          if (url && url.startsWith('r2://')) {
            const objectKey = url.replace('r2://', '');
            try {
              const now = Date.now();
              const storageKey = `presigned_${objectKey}`;
              let cachedUrl = signedUrlCache.get(objectKey)?.url;
              
              // If not in memory, check AsyncStorage
              if (!cachedUrl) {
                const persisted = await AsyncStorage.getItem(storageKey);
                if (persisted) {
                   const parsed = JSON.parse(persisted);
                   if (parsed.expires > now) {
                     cachedUrl = parsed.url;
                     signedUrlCache.set(objectKey, { url: parsed.url, expires: parsed.expires });
                   }
                }
              }

              if (cachedUrl) {
                asset.resolutions[res] = cachedUrl;
              } else {
                const signedUrl = await storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download');
                asset.resolutions[res] = signedUrl;
                const expires = now + 55 * 60 * 1000;
                signedUrlCache.set(objectKey, { url: signedUrl, expires });
                AsyncStorage.setItem(storageKey, JSON.stringify({ url: signedUrl, expires })).catch(console.error);
              }
            } catch (e) {
              console.error('Failed to presign URL', e);
            }
          }
        }
      }
      
      return resultAssets;
    },
    enabled: !!activeFestival?.id,
    refetchInterval: isProcessing ? 3000 : false, // Poll if queue is processing
  });

  const [waNumber, setWaNumber] = useState('');
  const [waCaption, setWaCaption] = useState('🏆 *{festival_name}* 🏆\n━━━━━━━━━━━━━━━━━━━━\n\n*മത്സരഫലം പ്രസിദ്ധീകരിച്ചു!* 🎉\n\n🔹 *ഇനം:* {event_name}\n{result_no_text}\n\nവിജയികൾക്ക് അഭിനന്ദനങ്ങൾ! 🌟');
  const [isSharingId, setIsSharingId] = useState<string | null>(null);

  React.useEffect(() => {
    const loadWaSettings = async () => {
      try {
        const savedNumber = await AsyncStorage.getItem('waTargetNumber');
        if (savedNumber) setWaNumber(savedNumber);
        
        const savedCaption = await AsyncStorage.getItem('waCaptionTemplate_v2');
        if (savedCaption) setWaCaption(savedCaption);
      } catch (e) {
        console.error('Failed to load WA settings', e);
      }
    };
    loadWaSettings();
  }, []);

  const saveWaNumber = async (val: string) => {
    setWaNumber(val);
    await AsyncStorage.setItem('waTargetNumber', val).catch(console.error);
  };

  const saveWaCaption = async (val: string) => {
    setWaCaption(val);
    await AsyncStorage.setItem('waCaptionTemplate_v2', val).catch(console.error);
  };

  const handleWhatsAppShare = async (asset: any) => {
    if (!waNumber.trim()) {
      alert('Please enter a WhatsApp number at the top of the page first.');
      // Focus could be done if we had a ref
      return;
    }
    
    // Format number: remove non-digits
    let cleanNumber = waNumber.replace(/\D/g, '');
    if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber; // default to India if just 10 digits

    try {
      setIsSharingId(asset.render_hash);
      const imageUrl = asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard;
      
      // Generate text
      const text = waCaption
        .replace(/{event_name}/g, asset.event_name || '')
        .replace(/{result_no}/g, asset.result_no || '')
        .replace(/{result_no_text}/g, asset.result_no ? `🔹 *റിസൾട്ട് നമ്പർ:* ${asset.result_no}` : '')
        .replace(/{festival_name}/g, activeFestival?.custom_name || 'Festos');

      if (Platform.OS === 'web') {
        try {
          // In modern browsers, fetching takes time, which invalidates the user gesture.
          // To fix this, we pass a Promise directly into ClipboardItem.
          const makeImagePromise = async () => {
            let response = await fetch(imageUrl).catch(() => null);
            if (!response || !response.ok) {
              response = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`);
            }
            const blob = await response.blob();
            
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = URL.createObjectURL(blob);
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No canvas context');
            ctx.drawImage(img, 0, 0);

            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Canvas toBlob failed'));
              }, 'image/png');
            });
          };

          const clipboardItem = new (window as any).ClipboardItem({
            'image/png': makeImagePromise()
          });

          await navigator.clipboard.write([clipboardItem]);
          
          const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\n[Please paste the image that was just copied to your clipboard!]')}`;
          window.open(waUrl, '_blank');
          alert('✅ Image copied to clipboard!\n\nWhatsApp will now open. Just press Paste (Ctrl+V) in the chat to send the image.');
        } catch (clipboardError) {
          console.error('Clipboard write failed:', clipboardError);
          // Fallback if clipboard fails
          const fallbackUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\nView Poster: ' + imageUrl)}`;
          window.open(fallbackUrl, '_blank');
          alert('Could not copy image automatically. Sent link instead.');
        }
      } else {
        // Mobile fallback
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: text,
              text: text,
            });
            return;
          } catch (shareErr) {
            console.log('Mobile share failed, falling back to link');
          }
        }
        
        const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(text + '\n\nView Poster: ' + imageUrl)}`;
        Linking.openURL(url);
      }
    } catch (e) {
      console.error('Share error:', e);
      alert('Failed to share image.');
    } finally {
      setIsSharingId(null);
    }
  };

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Media Center</Text>
          <Text style={styles.subtitle}>Manage and share generated assets</Text>
        </View>
        <View style={styles.headerActions}>
          {isProcessing && (
            <View style={styles.queueBadge}>
              <ActivityIndicator size="small" color={coreColor(colors.navy, 'primaryText')} />
              <Text style={styles.queueText}>{jobs.length} Jobs Queued</Text>
            </View>
          )}
          <TouchableOpacity style={styles.btnSecondary} onPress={() => refetch()}>
            <RefreshCw size={16} color={coreColor(colors.navy, 'primaryText')} />
            <Text style={styles.btnSecondaryText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary}>
            <Archive size={16} color={ui.colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>Batch Export (ZIP)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: coreColor('#0F766E', 'primary') }]} onPress={() => setShowUploadModal(true)}>
            <Upload size={16} color={ui.colors.onPrimary} />
            <Text style={styles.btnPrimaryText}>Upload Poster</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ActivityIndicator size="large" color={coreColor(colors.navy, 'primaryText')} style={{ marginTop: 40 }} />
        ) : assets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🗂️</Text>
            <Text style={styles.emptyTitle}>No assets generated yet</Text>
            <Text style={styles.emptySub}>Publish results in Poster Studio to see them here.</Text>
          </View>
        ) : (
          <>
            <View style={{ marginBottom: 20, padding: 16, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <View style={{ flex: 1, minWidth: 250 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: coreColor(colors.navy, 'primaryText') }}>WhatsApp Target Number</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Enter the phone number (with country code).</Text>
                </View>
                <TextInput 
                  value={waNumber}
                  onChangeText={saveWaNumber}
                  placeholder="e.g. 919876543210"
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, width: 200, fontSize: 14 }}
                  keyboardType="phone-pad"
                />
              </View>
              
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: coreColor(colors.navy, 'primaryText') }}>WhatsApp Image Caption Template</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' *bold text*')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold' }}>B</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' _italic text_')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, fontStyle: 'italic' }}>I</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => saveWaCaption(waCaption + ' ~strikethrough~')} style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: coreColor('#F1F5F9', 'surface'), borderRadius: 4 }}>
                      <Text style={{ fontSize: 12, textDecorationLine: 'line-through' }}>S</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TextInput 
                  value={waCaption}
                  onChangeText={saveWaCaption}
                  multiline
                  numberOfLines={4}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
                />
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                  Placeholders: {'{event_name}'}, {'{result_no}'}, {'{result_no_text}'}, {'{festival_name}'}
                </Text>
              </View>
            </View>
            <View style={styles.grid}>
              {assets.map((asset: any) => (
              <View key={asset.render_hash} style={styles.card}>
                <View style={styles.imageContainer}>
                  <Image 
                    source={{ uri: asset.resolutions?.thumb || asset.resolutions?.standard || asset.resolutions?.hd || 'https://via.placeholder.com/400' }} 
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.qualityBadge}>
                    <Text style={styles.qualityText}>
                      {asset.resolutions?.hd ? '4K HD' : asset.resolutions?.standard ? 'HD' : 'Standard'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardBody}>
                  <Text style={styles.eventName} numberOfLines={1}>{asset.event_name}</Text>
                  <Text style={{fontSize: 9, color: 'red', marginTop: 4}} numberOfLines={2}>
                    URL: {asset.resolutions?.thumb || asset.resolutions?.standard || asset.resolutions?.hd || 'No URL'}
                  </Text>
                  <Text style={styles.metaText}>
                    {asset.result_no ? `Result #${asset.result_no}` : 'General Poster'} • {new Date(asset.created_at).toLocaleDateString()}
                  </Text>
                  
                  <View style={styles.actionsGrid}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, !asset.resolutions?.hd && styles.actionBtnDisabled]}
                      onPress={() => asset.resolutions?.hd && openUrl(asset.resolutions.hd)}
                      disabled={!asset.resolutions?.hd}
                    >
                      <Download size={14} color={coreColor(colors.navy, 'primaryText')} />
                      <Text style={styles.actionText}>HD PNG</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, !asset.resolutions?.print && styles.actionBtnDisabled]}
                      onPress={() => asset.resolutions?.print && openUrl(asset.resolutions.print)}
                      disabled={!asset.resolutions?.print}
                    >
                      <Download size={14} color={coreColor(colors.navy, 'primaryText')} />
                      <Text style={styles.actionText}>PDF</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.actionBtn}
                      onPress={() => {
                        const url = asset.resolutions?.share || asset.resolutions?.hd || asset.resolutions?.standard;
                        if(Platform.OS === 'web') {
                          navigator.clipboard.writeText(url);
                          alert('Link copied to clipboard!');
                        }
                      }}
                    >
                      <Share2 size={14} color={coreColor(colors.navy, 'primaryText')} />
                      <Text style={styles.actionText}>Link</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.actionBtnWhatsApp]}
                      onPress={() => handleWhatsAppShare(asset)}
                    >
                      <Share2 size={14} color={ui.colors.onPrimary} />
                      <Text style={styles.actionTextWhatsApp}>Share</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={[styles.actionBtn, { backgroundColor: ui.colors.dangerSoft }]}
                      onPress={() => handleDeletePoster(asset)}
                    >
                      <Trash2 size={14} color={ui.colors.danger} />
                      <Text style={[styles.actionText, { color: ui.colors.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
          </>
        )}
      </ScrollView>

      {/* Upload Poster Modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isUploading && setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Custom Poster</Text>
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Event / Poster Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Malayalam Speech Result"
                value={uploadEventName}
                onChangeText={setUploadEventName}
                editable={!isUploading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Poster Image (JPG/PNG/WEBP) *</Text>
              <TouchableOpacity 
                style={styles.imagePickerBtn} 
                onPress={handleFileSelect}
                disabled={isUploading}
              >
                {previewUrl ? (
                  <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Plus size={24} color={colors.muted} />
                    <Text style={styles.imagePlaceholderText}>Click to select image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {isUploading && (
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                <Text style={styles.progressText}>Uploading... {Math.round(uploadProgress)}%</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.btnCancel} 
                onPress={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setUploadEventName('');
                }}
                disabled={isUploading}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.btnPrimary, { backgroundColor: coreColor('#0F766E', 'primary') }, (!selectedFile || !uploadEventName.trim() || isUploading) && styles.btnDisabled]}
                onPress={handleUploadPoster}
                disabled={!selectedFile || !uploadEventName.trim() || isUploading}
              >
                {isUploading ? <ActivityIndicator size="small" color={coreColor("#fff", 'onPrimary')} /> : <Upload size={16} color={coreColor("#fff", 'onPrimary')} />}
                <Text style={styles.btnPrimaryText}>{isUploading ? 'Uploading...' : 'Upload Poster'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  queueText: {
    fontSize: 13,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: ui.colors.onPrimary,
  },
  scrollContent: {
    padding: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  card: {
    width: 320,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 280,
    backgroundColor: colors.bg,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  qualityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: coreAlpha(coreColor('#0b1f3a', 'surface'), 0.8),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backdropFilter: 'blur(4px)',
  },
  qualityText: {
    color: ui.colors.onPrimary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 16,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderRadius: 6,
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
  },
  actionBtnWhatsApp: {
    backgroundColor: colors.whatsapp,
  },
  actionTextWhatsApp: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.colors.onPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: coreAlpha(coreColor('#000000', 'overlay'), 0.5),
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: coreColor(colors.navy, 'primaryText'),
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  imagePickerBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 14,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  progressContainer: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: coreColor('#0F766E', 'primary'),
  },
  progressText: {
    position: 'absolute',
    top: -20,
    right: 0,
    fontSize: 12,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnCancelText: {
    color: colors.muted,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  }
});
