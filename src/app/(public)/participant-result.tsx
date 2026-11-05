import React, { useMemo } from 'react';
import Head from 'expo-router/head';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';
import { usePublicPublishedResults } from '../../core/hooks/useLeaderboard';
import { ArrowLeft, Award, Medal } from 'lucide-react-native';

export default function ParticipantResultPage() {
  const router = useRouter();
  const { tenant_id: queryTenantId, query: searchQueryParam } = useLocalSearchParams<{ tenant_id?: string, query?: string }>();
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = (Array.isArray(queryTenantId) ? queryTenantId[0] : queryTenantId) || authTenantId || 'f87172d1-ed27-4db4-842c-cc00d3d56de2';
  const query = Array.isArray(searchQueryParam) ? searchQueryParam[0] : (searchQueryParam || '');

  const settingsQuery = useGetPublicLeaderboardSettings(tenantId);
  const festivalId = settingsQuery.data?.festival_id;

  const publishedResultsQuery = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);

  const matchingResults = useMemo(() => {
    if (!publishedResultsQuery.data || !query.trim()) return [];
    const lowerQuery = query.toLowerCase().trim();
    
    return publishedResultsQuery.data.filter(r => {
      if (!(r as any).participants) return false;
      return (r as any).participants.some((p: any) => 
        (p.chest_no && p.chest_no.toLowerCase().includes(lowerQuery)) || 
        (p.name && p.name.toLowerCase().includes(lowerQuery))
      );
    }).map(r => {
      const matches = (r as any).participants.filter((p: any) => 
        (p.chest_no && p.chest_no.toLowerCase().includes(lowerQuery)) || 
        (p.name && p.name.toLowerCase().includes(lowerQuery))
      );
      return { ...r, matchedParticipants: matches };
    });
  }, [publishedResultsQuery.data, query]);

  return (
    <div style={{ flex: 1, width: "100%", minHeight: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-alviora-bg bg-pattern text-alviora-body font-body-md antialiased">
      <Head><style>{`
.bg-pattern { background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 20px 20px; }
`}</style>
        <title>Search Results - Festos</title>
      </Head>
      
      {/* TopNavBar */}
      <nav className="bg-alviora-bg/80 backdrop-blur-xl border-b border-alviora-border sticky top-0 z-50 shadow-sm w-full">
        <div className="flex items-center px-gutter py-4 max-w-container-max mx-auto">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 text-alviora-primary flex flex-row items-center gap-1 hover:opacity-80">
            <ArrowLeft size={20} color="#1C5FA8" />
            <Text className="text-alviora-primary font-title-md font-semibold">Back</Text>
          </TouchableOpacity>
          <a className="font-headline-lg text-headline-lg font-black text-alviora-primary tracking-tighter" href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}>
            <img src="/brand/consolium-icon-192.png" alt="Festos" width="32" height="32" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, borderRadius: 8 }} />
            <span className="text-2xl uppercase" style={{fontFamily:"Barabara, sans-serif",fontWeight:"800",letterSpacing:"0.05em",color:"#ffffff"}}>FESTOS</span>
          </a>
        </div>
      </nav>

      <main className="px-gutter py-12 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="font-headline-lg text-headline-lg text-alviora-heading mb-2">Search Results</h1>
          <p className="font-body-lg text-body-lg text-alviora-body">
            Showing results for <span className="font-bold text-alviora-primary">"{query}"</span>
          </p>
        </div>

        {publishedResultsQuery.isLoading || settingsQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <ActivityIndicator size="large" color="#1C5FA8" />
          </div>
        ) : matchingResults.length === 0 ? (
          <div className="bg-white/10 rounded-xl border border-alviora-border p-12 text-center shadow-sm flex flex-col items-center">
            <span className="material-symbols-outlined text-alviora-body mb-4" style={{fontFamily:"'Material Symbols Outlined'", fontSize: 48}}>search_off</span>
            <h3 className="font-title-md text-title-md text-alviora-heading font-bold mb-2">No results found</h3>
            <p className="text-alviora-body">We couldn't find any published results matching that chest number or name.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {matchingResults.map((result, idx) => (
              <div key={idx} className="bg-white/5 rounded-xl border border-alviora-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-black/20 px-6 py-4 border-b border-alviora-border flex justify-between items-center">
                  <div>
                    <h3 className="font-title-md text-title-md text-alviora-heading font-bold">{result.item_name}</h3>
                    <p className="font-label-sm text-label-sm text-alviora-primary uppercase tracking-wider mt-1">
                      {result.participant_category_code} {result.festival_level ? `• ${result.festival_level}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs text-alviora-body font-label-sm">
                    {result.published_at ? new Date(result.published_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <div className="p-6">
                  {(result as any).matchedParticipants.map((p: any, pIdx: number) => (
                    <div key={pIdx} className="flex items-center justify-between border-b border-alviora-border last:border-0 py-3 last:pb-0 first:pt-0">
                      <div>
                        <Text className="font-body-lg text-body-lg text-alviora-heading font-bold">{p.name || 'Unknown'}</Text>
                        <Text className="font-body-md text-body-md text-alviora-body">Chest No: {p.chest_no}</Text>
                        <Text className="font-body-md text-body-md text-alviora-body text-sm mt-1">{p.team_name}</Text>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {p.position && (
                          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full flex flex-row items-center gap-1">
                            <Medal size={14} color="#b45309" />
                            <Text className="text-amber-800 text-xs font-bold uppercase tracking-wider">{p.position}{p.position === 1 ? 'st' : p.position === 2 ? 'nd' : p.position === 3 ? 'rd' : 'th'} Place</Text>
                          </div>
                        )}
                        {p.grade && (
                          <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full flex flex-row items-center gap-1">
                            <Award size={14} color="#166534" />
                            <Text className="text-green-800 text-xs font-bold uppercase tracking-wider">{p.grade} Grade</Text>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

