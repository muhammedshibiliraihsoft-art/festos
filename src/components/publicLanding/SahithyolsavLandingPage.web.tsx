import React, { useState, useMemo, useEffect } from 'react';
import Head from 'expo-router/head';
import { BentoVideo } from './BentoVideo';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { storageService } from '../../services/storage/storageService';
import { useGetPublicLeaderboardSettings } from '../../core/hooks/useLeaderboardSettings';
import { usePublicPublishedResults, usePublicLeaderboard } from '../../core/hooks/useLeaderboard';
import { usePublicSchedule } from '../../core/hooks/useSchedule';
import { Swirling } from '../loading-ui/swirling';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../core/config/supabase';
import { getCategoryLabel } from '../../constants/categories';

const InitialLoader = ({ isReady }: { isReady: boolean }) => {
  const [shouldRender, setShouldRender] = React.useState(true);

  React.useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => setShouldRender(false), 500); // Wait for fade out animation
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!shouldRender) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-alviora-bg transition-opacity duration-500 ease-in-out ${isReady ? 'opacity-0' : 'opacity-100'}`}>
      <div className="flex flex-col items-center gap-8 fade-in-up visible">
        <span className="text-5xl uppercase tracking-widest text-alviora-primary keep-font drop-shadow-lg" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>
          FESTOS
        </span>
        <Swirling className="w-16 h-16 text-white" />
        <p className="font-['Handjet'] text-sm tracking-widest text-white/70 uppercase animate-pulse">Initializing Experience...</p>
      </div>
    </div>
  );
};

const VideoBackground = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  // Store a list of which videos have been loaded at least once
  const [loadedVideos, setLoadedVideos] = useState<number[]>([0]);

  const videos = [
    '/videos/leaderboard_1.mp4?v=1',
    '/videos/leaderboard_2.mp4?v=1'
  ];

  useEffect(() => {
    if (videos.length > 1) {
      const interval = setInterval(() => {
        setActiveIndex((prev) => {
          const next = (prev + 1) % videos.length;
          setLoadedVideos((loaded) => loaded.includes(next) ? loaded : [...loaded, next]);
          return next;
        });
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [videos.length]);

  return (
    <>
      {videos.map((src, index) => {
        const isActive = index === activeIndex;
        const isLoaded = loadedVideos.includes(index);
        return (
          <video
            key={src}
            // Only set src if it has been loaded
            src={isLoaded ? src : undefined}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover z-0 mix-blend-screen"
            style={{ opacity: isActive ? 0.5 : 0, transition: 'opacity 1.5s ease-in-out' }}
          />
        );
      })}
    </>
  );
};




const PremiumScheduleCarousel = ({ schedules, onSelectSchedule }: any) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  const getActiveIndex = () => {
    const now = new Date();
    let activeIdx = -1;
    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      if ((s.status || "").toLowerCase() === "ongoing") return i;
      if (s.start_time && new Date(s.start_time) > now) {
        if (activeIdx === -1) activeIdx = i;
      }
    }
    return activeIdx !== -1 ? activeIdx : 0;
  };
  const activeIndex = getActiveIndex();

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.left + container.clientWidth / 2;
      const cards = container.querySelectorAll('.schedule-card-element');
      
      cards.forEach((card: any) => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const dist = Math.abs(containerCenter - cardCenter);
        const maxDist = container.clientWidth / 1.5;
        
        let scale = 1 - (dist / maxDist) * 0.15; 
        if (scale < 0.85) scale = 0.85;
        if (scale > 1) scale = 1;

        let opacity = 1 - (dist / maxDist) * 0.4;
        if (opacity < 0.5) opacity = 0.5;
        if (opacity > 1) opacity = 1;

        card.style.transform = `scale(${scale})`;
        card.style.opacity = opacity.toString();
      });
    });
  };

  React.useEffect(() => {
    handleScroll();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleScroll, { passive: true });
      setTimeout(handleScroll, 100);
    }
    return () => {
      if (container) container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [schedules]);

  const scrollBy = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  if (!schedules || schedules.length === 0) {
    return (
      <div className="w-full text-center py-16 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center backdrop-blur-sm max-w-[1400px] mx-auto">
        <span className="material-symbols-outlined text-4xl text-white/20 mb-4" style={{fontSize:"48px"}}>event_busy</span>
        <p className="text-alviora-body font-title-md">No events scheduled at the moment.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full group/carousel pb-8">
      {/* Desktop Arrows */}
      <button 
        onClick={() => scrollBy(-400)}
        className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl ${canScrollLeft ? "opacity-100 visible" : "opacity-0 invisible"}`}
        aria-label="Previous events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_left</span>
      </button>

      <button 
        onClick={() => scrollBy(400)}
        className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center transition-all hover:bg-alviora-primary hover:border-alviora-primary hover:scale-110 shadow-xl ${canScrollRight ? "opacity-100 visible" : "opacity-0 invisible"}`}
        aria-label="Next events"
      >
        <span className="material-symbols-outlined" style={{fontSize: "24px"}}>chevron_right</span>
      </button>

      {/* Scroll Container */}
      <div 
        ref={scrollRef}
        className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 md:px-8 py-12"
        style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
      >
        {schedules.map((schedule: any, idx: number) => {
          const isTimeActive = idx === activeIndex;
          const bgId = (idx % 10) + 1;
          const bgImage = `/images/schedule/bg-${bgId}.jpg`;
          
          let dateStr = "TBA";
          let monthStr = "";
          if (schedule.start_time) {
            const d = new Date(schedule.start_time);
            dateStr = d.getDate().toString().padStart(2, "0");
            monthStr = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
          }

          let timeStr = "TBA";
          if (schedule.start_time) {
            const start = new Date(schedule.start_time).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"});
            timeStr = start;
            if (schedule.end_time) {
              const end = new Date(schedule.end_time).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"});
              timeStr = `${start} - ${end}`;
            }
          }

          const statusRaw = (schedule.status || "").toLowerCase();
          const isOngoing = statusRaw === "ongoing";
          const isCompleted = statusRaw === "completed";
          const isPublished = schedule.is_published === true || statusRaw === "published";
          const isPending = schedule.has_results === true || schedule.has_marks === true || ["mark submitted", "checking pending", "checking completed"].includes(statusRaw);
          
          let statusText = schedule.status || "SCHEDULED";
          let statusStyle = "bg-alviora-primary/20 text-[#60a5fa] border-[#60a5fa]/30"; 
          
          if (isPublished) { statusText = "PUBLISHED"; statusStyle = "bg-green-500/20 text-green-400 border-green-500/30"; }
          else if (isPending) { statusText = "VERIFICATION PENDING"; statusStyle = "bg-[#c69a53]/20 text-[#c69a53] border-[#c69a53]/30"; }
          else if (isCompleted) { statusText = "COMPLETED"; statusStyle = "bg-[#a9f5d0]/20 text-[#a9f5d0] border-[#a9f5d0]/30"; }
          else if (isOngoing) { statusText = "STARTED"; statusStyle = "bg-error-container text-on-error-container border-error-container/50"; }

          return (
            <div 
              key={idx}
              onClick={() => onSelectSchedule(schedule)}
              className={`schedule-card-element relative shrink-0 snap-center cursor-pointer group/card
                w-[85vw] sm:w-[320px] md:w-[360px] h-[400px] rounded-[2rem] overflow-hidden shadow-2xl transition-shadow
                ${isTimeActive ? "ring-2 ring-alviora-primary/50 shadow-[0_0_40px_rgba(59,130,246,0.3)]" : "hover:ring-1 hover:ring-white/20"}
              `}
              style={{ transformOrigin: "center center", willChange: "transform, opacity" }}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover/card:scale-110"
                style={{ backgroundImage: `url('${bgImage}')` }}
              />
              <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/80 to-transparent" />
              <div className="absolute inset-0 rounded-[2rem] border border-white/10 group-hover/card:border-white/30 transition-colors pointer-events-none" />

              <div className="relative h-full w-full p-6 flex flex-col justify-between z-10 pointer-events-none">
                <div className="flex justify-between items-start">
                  <div className="bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex flex-col items-center justify-center min-w-[70px] shadow-lg">
                    <span className="font-headline-lg font-bold text-white leading-none text-2xl">{dateStr}</span>
                    <span className="text-[10px] uppercase tracking-widest text-alviora-accent mt-1 font-bold">{monthStr}</span>
                  </div>
                  {isTimeActive && (
                    <div className="bg-alviora-primary/30 backdrop-blur-md w-10 h-10 rounded-full border border-alviora-primary/50 flex items-center justify-center text-alviora-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                      <span className="material-symbols-outlined text-lg" style={{fontSize: "20px"}}>star</span>
                    </div>
                  )}
                </div>

                <div className="space-y-4 flex flex-col justify-end h-full">
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 border backdrop-blur-md shadow-sm ${statusStyle}`}>
                      {statusText}
                    </span>
                    <h3 className="font-title-lg text-2xl text-white font-bold leading-tight group-hover/card:text-alviora-primary transition-colors line-clamp-2 drop-shadow-md">
                      {schedule.items?.item_name_en || schedule.items?.name || "Event Item"}
                    </h3>
                    <p className="text-alviora-accent-dim text-xs font-semibold uppercase tracking-wider mt-2 opacity-90">
                      {schedule.categories?.name || "General Category"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-white/90 text-sm">
                      <span className="material-symbols-outlined text-alviora-primary" style={{fontSize: "16px"}}>location_on</span>
                      <span className="truncate drop-shadow-sm">{schedule.venues?.name || `Stage ${(idx % 10) + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/90 text-sm font-mono">
                      <span className="material-symbols-outlined text-alviora-primary" style={{fontSize: "16px"}}>schedule</span>
                      <span className="drop-shadow-sm">{timeStr}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function SahithyolsavLandingPage({ page = 'landing', children }: { page?: 'landing' | 'schedule' | 'units' | 'items' | 'media', children?: React.ReactNode }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const { tenant_id: queryTenantId } = useLocalSearchParams<{ tenant_id?: string }>();
  const { tenant_id: authTenantId } = useAuthStore();
  const tenantId = (Array.isArray(queryTenantId) ? queryTenantId[0] : queryTenantId) || authTenantId || 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

  const settingsQuery = useGetPublicLeaderboardSettings(tenantId);
  const festivalId = settingsQuery.data?.festival_id;

  const publishedResultsQuery = usePublicPublishedResults(tenantId, festivalId, !!tenantId && !!festivalId, true);
  const organisationQuery = usePublicLeaderboard(tenantId, festivalId, !!tenantId && !!festivalId);
  const scheduleQuery = usePublicSchedule(festivalId, tenantId);

  const { data: generatedPosters = [] } = useQuery({
    queryKey: ['public-generated-posters-item-results', festivalId],
    queryFn: async () => {
      if (!festivalId) return [];
      const { data, error } = await supabase
        .from('generated_assets')
        .select('*')
        .eq('festival_id', festivalId)
        .order('created_at', { ascending: false });
      if (error) return [];
      for (const asset of data) {
         if (asset.public_url && asset.public_url.startsWith('r2://')) {
            const objectKey = asset.public_url.replace('r2://', '');
            try {
              asset.resolved_url = await storageService.getPresignedUrl(objectKey, 'image/jpeg', 'download');
            } catch(e) {}
         } else {
            asset.resolved_url = asset.public_url;
         }
      }
      return data;
    },
    enabled: page === 'items' && !!festivalId
  });

  const { availableCategories, filteredItemResults: groupedItemResults } = React.useMemo(() => {
    if (!publishedResultsQuery.data) return { availableCategories: [], filteredItemResults: [] };
    const grouped: Record<string, any> = {};
    const categories = new Set<string>();
    publishedResultsQuery.data.forEach((r: any) => {
      const key = r.item_id || r.item_name;
      const rawCategory = r.item_category_codes?.length ? r.item_category_codes[0] : r.participant_category_code;
      const category = rawCategory ? getCategoryLabel(rawCategory) : null;
      if (category) categories.add(category);
      if (!grouped[key]) {
        grouped[key] = {
          item_id: r.item_id,
          result_id: r.result_id,
          item_name: r.item_name,
          category,
          participants: []
        };
      }
      if (r.rank) {
        grouped[key].participants.push({
          name: r.participant_name,
          chest_no: r.chest_number,
          position: r.rank,
          grade: r.grade,
          organisation_name: r.organisation_name
        });
      }
    });
    const allItems = Object.values(grouped).sort((a: any, b: any) => a.item_name.localeCompare(b.item_name));
    
    const filtered = allItems.filter(item => {
      const matchesSearch = searchTerm ? item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) : true;
      const matchesCategory = selectedCategory ? item.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });

    return {
      availableCategories: Array.from(categories).sort(),
      filteredItemResults: filtered
    };
  }, [publishedResultsQuery.data, searchTerm, selectedCategory]);
  
  // Initial Splash Screen Logic
  const [isAppReady, setIsAppReady] = React.useState(false);
  React.useEffect(() => {
    // ONLY block on settings to show the Hero Section ASAP.
    // The other queries (organisation, results, schedule) can load in the background.
    const isDataLoaded = !settingsQuery.isLoading;
    if (isDataLoaded) {
      setIsAppReady(true);
    }
  }, [settingsQuery.isLoading]);

  // Removed artificial transition delay. We now rely only on actual data loading states.
  const isTransitioning = false;

  const [selectedSchedule, setSelectedSchedule] = React.useState<any>(null);
  const [activeFilter, setActiveFilter] = React.useState<string>('all');

  const uniqueDates = React.useMemo(() => {
    const dates = new Set<string>();
    const schedules = scheduleQuery.data || [];
    schedules.forEach((s: any) => {
      if (s.start_time) {
        dates.add(new Date(s.start_time).toDateString());
      }
    });
    return Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [scheduleQuery.data]);

  const filterTabs = React.useMemo(() => {
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'today', label: 'Today' },
      { id: 'tomorrow', label: 'Tomorrow' }
    ];
    uniqueDates.forEach(dateStr => {
      const formatted = new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
      const isToday = dateStr === new Date().toDateString();
      const isTomorrow = dateStr === new Date(Date.now() + 86400000).toDateString();
      if (!isToday && !isTomorrow) {
        tabs.push({ id: dateStr, label: formatted });
      }
    });
    return tabs;
  }, [uniqueDates]);

  const filteredSchedules = React.useMemo(() => {
    const schedules = scheduleQuery.data || [];
    if (page === 'landing') {
      const isFuture = (s: any) => s.status === 'Ongoing' || s.status === 'Upcoming' || (s.start_time && new Date(s.start_time).getTime() > Date.now());
      const future = schedules.filter(isFuture).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      const past = schedules.filter((s: any) => !isFuture(s)).sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      return [...future, ...past].slice(0, 12);
    }

    // For schedule page: filter by active tab
    if (activeFilter === 'all') return schedules;
    if (activeFilter === 'today') {
      return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === new Date().toDateString());
    }
    if (activeFilter === 'tomorrow') {
      return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === new Date(Date.now() + 86400000).toDateString());
    }
    return schedules.filter((s: any) => s.start_time && new Date(s.start_time).toDateString() === activeFilter);
  }, [scheduleQuery.data, activeFilter, page]);


  const [searchQuery, setSearchQuery] = useState('');
  
  const [resolvedPosters, setResolvedPosters] = useState<string[]>([]);
  const [activePosterIdx, setActivePosterIdx] = useState(0);

  React.useEffect(() => {
    const rawPosters = settingsQuery.data?.theme_config?.team_point_posters || [];
    if (rawPosters.length === 0) {
      setResolvedPosters([]);
      return;
    }
    
    // Resolve any r2:// urls
    const resolveUrls = async () => {
      const urls = await Promise.all(rawPosters.map(async (p: string) => {
        if (p.startsWith('r2://')) {
          const key = p.replace('r2://', '');
          try {
             const signed = await storageService.getPresignedUrl(key, 'image/jpeg', 'download');
             return signed;
          } catch(e) {
             return p;
          }
        }
        return p;
      }));
      setResolvedPosters(urls);
    };
    resolveUrls();
  }, [settingsQuery.data?.theme_config?.team_point_posters]);

  React.useEffect(() => {
    if (resolvedPosters.length > 1) {
      const timer = setInterval(() => {
        setActivePosterIdx(prev => (prev + 1) % resolvedPosters.length);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [resolvedPosters.length]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleSearch = (e: any) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/participant-result?tenant_id=${tenantId}&query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Ticker Logic
  const tickerItems = useMemo(() => {
    if (!publishedResultsQuery.data || publishedResultsQuery.data.length === 0) return ["Welcome to Festos"];
    return publishedResultsQuery.data.slice(0, 10).map((r: any) => {
      const topWinner = r.participants?.find((p: any) => p.position === 1);
      return `RESULT PUBLISHED: ${r.item_name} ${r.participant_category_code ? `(${r.participant_category_code})` : ''} - 1st Place: ${topWinner?.name || 'Announced'}`;
    });
  }, [publishedResultsQuery.data]);
  
  const tickerString = tickerItems.join(' | ');

  // Schedule Logic
  const liveSchedules = useMemo(() => {
    if (!scheduleQuery.data) return [];
    return scheduleQuery.data
      .filter((s: any) => s.status === 'Ongoing' || s.status === 'Upcoming')
      .slice(0, 2);
  }, [scheduleQuery.data]);

  // Leaderboard Logic
  const topUnits = useMemo(() => {
    let data: any[] = organisationQuery.data || [];
    if (data.length === 0) {
      // Mock data for preview when no real data exists
      data = [
        { organisation_name: "Victoria", total_points: 0, first_place_count: 0, organisation_id: '1' },
        { organisation_name: "Gloria", total_points: 0, first_place_count: 0, organisation_id: '2' },
        { organisation_name: "Aurelia", total_points: 0, first_place_count: 0, organisation_id: '3' }
      ];
    }
    
    const maxPoints = Math.max(...data.map((r: any) => r.total_points), 1);
    return [...data]
      .sort((a: any, b: any) => b.total_points - a.total_points)
      .slice(0, page === 'units' ? undefined : 5) // Display all for units page, otherwise top 5
      .map((unit: any, index: number) => ({
        ...unit,
        rank: index + 1,
        percentage: Math.max((unit.total_points / maxPoints) * 100, 5) // At least 5% bar width
      }));
  }, [organisationQuery.data, page]);

  
  const stats = React.useMemo(() => {
    let campuses = 0;
    let competitors = 0;

    // Plan: Real campuses count
    if (organisationQuery.data) {
      campuses = organisationQuery.data.length;
    }

    // Plan: Real competitors count (falling back to 600 until registration API is integrated)
    if (publishedResultsQuery.data && publishedResultsQuery.data.length > 0) {
      const uniqueParticipants = new Set();
      publishedResultsQuery.data.forEach(result => {
        if ((result as any).participants) {
          (result as any).participants.forEach((p: any) => uniqueParticipants.add(p.chest_no || p.name));
        }
      });
      competitors = uniqueParticipants.size;
    }

    return { 
      days: 40, // Hardcoded as requested
      campuses: campuses > 0 ? campuses : 3, 
      events: 72, // Hardcoded until items API is available publicly
      competitors: competitors > 0 ? competitors : 600 
    };
  }, [organisationQuery.data, publishedResultsQuery.data]);

  const marqueeSchedules = React.useMemo(() => {
    if (filteredSchedules.length === 0) return [];
    const minCards = 12; // Ensure at least 12 cards to fill screen
    const items = [];
    while (items.length < minCards) {
      items.push(...filteredSchedules);
    }
    // Duplicate once more to ensure seamless scroll animation
    return [...items, ...items];
  }, [filteredSchedules]);

  // Determine if the current page's critical data is still loading
  const isPageDataLoading = React.useMemo(() => {
    if (settingsQuery.isLoading) return true;
    if (page === 'schedule' && scheduleQuery.isLoading) return true;
    if (page === 'units' && organisationQuery.isLoading) return true;
    if (page === 'items' && publishedResultsQuery.isLoading) return true;
    return false;
  }, [page, settingsQuery.isLoading, scheduleQuery.isLoading, organisationQuery.isLoading, publishedResultsQuery.isLoading]);

  return (
    <div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-[#050505] text-alviora-body font-body-md antialiased relative">
      {/* Fixed Ambient Background Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C5FA8]/20 via-black/5 to-transparent rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C5FA8]/20 via-black/5 to-transparent rounded-full blur-[100px] pointer-events-none z-0"></div>
      <InitialLoader isReady={isAppReady} />
      <Head>
        <title>{settingsQuery.data?.public_festival_name || 'ADSA Art Fiesta 2.0'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;family=Handjet:wght@100..900&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=VT323&amp;display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@800&amp;display=swap" rel="stylesheet"/>
        <style>{`
          .marquee-container { overflow: hidden; white-space: nowrap; }
          .marquee-content { display: inline-block; animation: marquee 30s linear infinite; }
          @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
          .schedule-marquee-container { display: flex; overflow: hidden; width: 100%; position: relative; }
          .schedule-marquee-track { display: flex; gap: 1.5rem; animation: schedule-marquee 90s linear infinite; width: max-content; }
          .schedule-marquee-container:hover .schedule-marquee-track { animation-play-state: paused; }
          @keyframes schedule-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50% - 0.75rem)); } }
          .handjet-wrapper, .handjet-wrapper *:not(.material-symbols-outlined):not(.keep-font) {
            font-family: "Handjet", sans-serif !important;
            font-variation-settings: "ELSH" 2 !important;
          }
          @media (prefers-reduced-motion: no-preference) {
              .fade-in-up { opacity: 0; transform: translateY(30px); transition: opacity 0.8s ease-out, transform 0.8s ease-out; }
              .fade-in-up.visible { opacity: 1; transform: translateY(0); }
              .hover-lift { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
              .hover-lift:hover { transform: scale(1.05); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); }
              @keyframes subtle-motion {
                  0%, 100% { color: #009499; text-shadow: 0 0 0 rgba(0,148,153,0); }
                  50% { color: #00b3b8; text-shadow: 0 0 25px rgba(0,148,153,0.8); }
              }
              .animate-subtle-motion { animation: subtle-motion 3s ease-in-out infinite; display: inline-block; }
              .glass-text { 
                background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.7) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 4px 20px rgba(255,255,255,0.15);
              }
          }
          @media (prefers-reduced-motion: reduce) {
              .fade-in-up { opacity: 1; transform: none; }
              .hover-lift { transition: none; }
              .hover-lift:hover { transform: none; }
              .animate-subtle-motion { animation: none; }
          }
        `}</style>
      </Head>

      {/* TopAppBar (Ticker) */}
      <div className="bg-white/5 backdrop-blur-md text-alviora-accent font-label-sm text-label-sm uppercase tracking-widest docked full-width top-0 z-[60] h-10 flex items-center px-margin-desktop overflow-hidden whitespace-nowrap border-b border-white/10">
        <div className="flex items-center md:gap-3 w-full max-w-container-max mx-auto px-2 md:px-0">
            <span className="hidden md:block material-symbols-outlined text-alviora-accent shrink-0 z-10" style={{fontVariationSettings:"'FILL' 1", fontSize: "18px"}}>sensors</span>
            <div className="marquee-container flex-1 overflow-hidden relative" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="marquee-content whitespace-nowrap">{tickerString}</span>
            </div>
          </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-white/5 backdrop-blur-3xl border-b border-white/10 docked full-width top-0 sticky z-50 transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center px-gutter py-4 max-w-container-max mx-auto">
          <Link className="font-headline-lg text-headline-lg font-bold text-alviora-primary tracking-tighter" href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}>
            <img src="/brand/consolium-icon-192.png" alt="Festos" className="mr-3 h-10 w-10 rounded-lg bg-white object-contain" />
            <span className="text-2xl uppercase keep-font" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#ffffff"}}>FESTOS</span>
          </Link>
          <div className="hidden md:flex gap-8 handjet-wrapper">
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'landing' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}>Home</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'schedule' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/schedule?tenant_id=${tenantId}`}>Schedule</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'units' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/unit-rankings?tenant_id=${tenantId}`}>Teams</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'individuals' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/individual-rankings?tenant_id=${tenantId}`}>Individuals</Link>
            <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'items' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/item-results?tenant_id=${tenantId}`}>Results</Link>
              <Link className={`transition-colors duration-200 font-bold text-lg uppercase tracking-widest ${page === 'media' ? 'text-[#c69a53]' : 'text-white hover:text-gray-200'}`} href={`/leaderboard/media?tenant_id=${tenantId}`}>Posters</Link>
          </div>
          <div className="flex gap-4 handjet-wrapper">
            
            <button className="hidden md:block hover-lift bg-[#c69a53] text-black px-6 py-2 rounded-full font-bold text-lg uppercase tracking-widest hover:bg-white duration-150 ease-in-out shadow-sm">Get In Touch</button>
              <button 
                className="md:hidden text-white p-2"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="material-symbols-outlined text-3xl">
                  {isMobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>
          </div>
        </div>
      </nav>

        {/* Mobile Menu Overlay */}
        <div 
          className={`md:hidden fixed inset-0 bg-black/95 backdrop-blur-3xl z-40 transition-all duration-300 ease-in-out flex flex-col pt-32 px-6 ${
            isMobileMenuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
          }`}
        >
          <div className="flex flex-col gap-6 font-['Handjet'] text-3xl uppercase tracking-widest">
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'landing' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard?tenant_id=${tenantId}&bypass_html=true`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'schedule' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard/schedule?tenant_id=${tenantId}`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Schedule
            </Link>
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'units' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard/unit-rankings?tenant_id=${tenantId}`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Teams
            </Link>
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'individuals' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard/individual-rankings?tenant_id=${tenantId}`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Individuals
            </Link>
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'items' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard/item-results?tenant_id=${tenantId}`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Results
            </Link>
            <Link 
              className={`transition-colors duration-200 border-b border-white/10 pb-4 ${page === 'media' ? 'text-[#c69a53]' : 'text-white'}`} 
              href={`/leaderboard/media?tenant_id=${tenantId}`}
              onPress={() => setIsMobileMenuOpen(false)}
            >
              Posters
            </Link>
            <button className="mt-8 bg-[#c69a53] text-black px-6 py-4 rounded-xl font-bold text-2xl uppercase tracking-widest shadow-sm">
              Get In Touch
            </button>
          </div>
        </div>

      <main>
        {isPageDataLoading && page !== 'landing' ? (
          <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center gap-6 fade-in-up visible">
            <Swirling className="w-16 h-16 text-white" />
            <p className="font-['Handjet'] text-sm tracking-widest text-[#c69a53] uppercase animate-pulse">Loading Content...</p>
          </div>
        ) : (
          <>
          {page === 'landing' && (<>{/* Hero Section */}
        <section className="hidden md:block p-6 w-full max-w-full mx-auto fade-in-up visible hero-section">
          <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-fit md:min-h-[85vh] flex items-center shadow-2xl border-[1.5px] border-white/10 ring-1 ring-white/5 bg-black shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]">
            
            {/* Background Video using Load Manager */}
            <VideoBackground />
            
            {/* Slight blur overlay and glassy inner border */}
            <div className="absolute inset-0 backdrop-blur-[3px] bg-black/20 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 rounded-[2.5rem] border-[1px] border-white/10 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 z-10 pointer-events-none"></div>
            
            {/* Top Right Logo Placeholder */}
            <div className="absolute top-8 right-8 md:top-12 md:right-12 z-30">
              <div className="relative w-20 h-20 md:w-28 md:h-28 rounded-full bg-black/10 backdrop-blur-sm border border-white/5 shadow-xl hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img 
                  src="/brand/consolium-icon-512.png"
                  alt="Logo" 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] h-[95%] object-contain mix-blend-screen"
                />
              </div>
            </div>

            {/* Left Aligned Content */}
            <div className="relative z-20 w-full p-8 md:p-16 lg:p-24 flex flex-col items-start text-left max-w-4xl">
              <div className="inline-flex items-center gap-2 bg-[#ffeedb]/10 text-[#f5d0a9] px-4 py-2 rounded-full mb-8 font-label-sm text-label-sm uppercase tracking-widest border border-[#f5d0a9]/20 shadow-sm backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-[#f5d0a9]"></span>
                ADSA ART FIESTA 2.0
              </div>
              
              <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl glass-text mb-6 leading-tight font-bold">
                <span style={{fontFamily: "Barabara, sans-serif"}} className="uppercase tracking-wide">FESTOS</span><br />
                Between <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>Pixels</span><br />
                and <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>People</span>
              </h1>
              
              <p className="font-body-lg text-body-lg text-white/80 mb-10 max-w-2xl leading-relaxed">
                Where the eternal word meets the universal language of art. A celebration of sacred expression and creative excellence.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-start items-center w-full sm:w-auto">
                <a href="#leaderboard" className="hover-lift w-full sm:w-auto bg-alviora-primary text-white px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#154a85] transition-all flex items-center justify-center gap-2 shadow-md">
                  <span className="material-symbols-outlined">emoji_events</span>
                  View Leaderboard
                </a>
                <a href="#live-schedule" className="hover-lift w-full sm:w-auto border border-white/20 text-white px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#333] transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                  <span className="material-symbols-outlined">calendar_today</span>
                  Today's Schedule</a>
                  <Link href={`/leaderboard/item-results?tenant_id=${tenantId}`} className="hover-lift w-full sm:w-auto border border-[#c69a53]/40 text-[#c69a53] px-8 py-4 rounded-full font-title-md text-title-md hover:bg-[#c69a53]/10 transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                    <span className="material-symbols-outlined">format_list_numbered</span>
                    Item Results
                  </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Hero Section */}
        <section className="block md:hidden p-4 w-full mx-auto fade-in-up visible hero-section">
          <div className="relative w-full rounded-[2.5rem] overflow-hidden min-h-[80vh] flex flex-col items-center justify-center shadow-2xl border-[1px] border-white/10 ring-1 ring-white/5 bg-black shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]">
            <VideoBackground />
            <div className="absolute inset-0 backdrop-blur-[3px] bg-black/30 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 rounded-[2.5rem] border-[1px] border-white/10 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 z-10 pointer-events-none"></div>
            
            <div className="relative z-20 w-full p-6 flex flex-col items-center text-center mt-12">
              <div className="relative w-20 h-20 rounded-full bg-black/20 backdrop-blur-md border border-white/10 shadow-xl mb-6">
                <img src="/brand/consolium-icon-512.png" alt="Festos logo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] object-contain" />
              </div>

              <div className="inline-flex items-center gap-2 bg-[#ffeedb]/10 text-[#f5d0a9] px-4 py-2 rounded-full mb-6 font-label-sm text-[10px] uppercase tracking-widest border border-[#f5d0a9]/20 shadow-sm backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5d0a9]"></span>
                ADSA ART FIESTA 2.0
              </div>
              
              <h1 className="text-[2.75rem] glass-text mb-4 leading-[1.1] font-bold">
                <span style={{fontFamily: "Barabara, sans-serif"}} className="uppercase tracking-wide text-[2rem]">FESTOS</span><br />
                Between <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>Pixels</span><br />
                and <span className="text-[#009499] animate-subtle-motion drop-shadow-lg" style={{fontFamily:"'VT323', monospace"}}>People</span>
              </h1>
              
              <p className="text-white/70 text-xs mb-10 max-w-[260px] leading-relaxed">
                Dive into the intersection of technology and humanity at the most anticipated art festival of the year.
              </p>
              
              <div className="flex flex-col gap-3 w-full px-2">
                <a href="#leaderboard" className="w-full bg-alviora-primary text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#154a85] transition-all flex items-center justify-center gap-2 shadow-md">
                  <span className="material-symbols-outlined text-lg">emoji_events</span>
                  View Leaderboard
                </a>
                <a href="#live-schedule" className="w-full border border-white/20 text-white py-4 rounded-2xl font-bold text-sm hover:bg-[#333] transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                  <span className="material-symbols-outlined text-lg">calendar_today</span>
                  Live Schedule</a>
                  <Link href={`/leaderboard/item-results?tenant_id=${tenantId}`} className="w-full border border-[#c69a53]/40 text-[#c69a53] py-4 rounded-2xl font-bold text-sm hover:bg-[#c69a53]/10 transition-all flex items-center justify-center gap-2 bg-black/30 backdrop-blur-sm shadow-sm">
                    <span className="material-symbols-outlined text-lg">format_list_numbered</span>
                    Item Results
                  </Link>
              </div>
            </div>
          </div>
        </section>


        

          </>)}
          
          {/* POST-HERO BACKGROUND WRAPPER */}
          <div className="relative w-full bg-transparent">
            {/* Background removed for uniformity */}
            <div className="relative z-10 flex flex-col">
              {page === 'landing' && (<>
        {/* Stats Section */}
        <div className="relative z-20 max-w-[1200px] w-full mx-auto px-4 mt-8 mb-20 fade-in-up visible">
          <div className="bg-[#121212]/70 backdrop-blur-3xl border border-[#333] rounded-[2rem] p-6 md:p-10 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl">
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.campuses}+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Teams</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">100+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Items</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">{stats.days}</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Days of Digital</div>
            </div>
            <div className="hidden md:block w-px h-12 bg-[#333]"></div>
            <div className="text-center">
              <div className="text-3xl md:text-5xl font-['Handjet'] font-bold text-white mb-1">40+</div>
              <div className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/50 font-bold">Participants</div>
            </div>
          </div>
        </div>

        </>)}
        {/* Live Schedule */}
        {(page === 'landing' || page === 'schedule') && (
        
          <section id="live-schedule" className="pt-4 md:pt-8 pb-section-gap max-w-full mx-auto fade-in-up visible handjet-wrapper overflow-hidden">
            <div className="max-w-[1400px] mx-auto px-gutter flex justify-between items-end mb-8">
              <div>
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg glass-text mb-2 font-bold">{page === 'schedule' ? 'Festival Schedule' : 'Event Schedule'}</h2>
                <p className="font-body-lg text-body-lg text-alviora-body">All scheduled programs across stages.</p>
              </div>
            </div>
            
            {page === 'schedule' && (
              <div className="max-w-[1400px] mx-auto px-gutter flex flex-wrap gap-2 mb-8">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-4 py-2 rounded-full font-title-sm text-title-sm transition-all ${
                      activeFilter === tab.id 
                        ? 'bg-alviora-primary text-white shadow-md' 
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <div className="w-full relative">
              <PremiumScheduleCarousel 
                schedules={page === 'landing' ? marqueeSchedules : filteredSchedules} 
                onSelectSchedule={setSelectedSchedule} 
              />
            </div>
          </section>

        )}

        {/* Schedule Modal */}
        {selectedSchedule && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSchedule(null)}></div>
            <div className="relative bg-alviora-bg border border-white/10 rounded-3xl max-w-lg w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setSelectedSchedule(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
              
              <div className="mb-6 pr-8">
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-4 ${
                  (selectedSchedule.status || '').toLowerCase() === 'ongoing' 
                    ? 'bg-error-container text-on-error-container' 
                    : (selectedSchedule.status || '').toLowerCase() === 'completed' 
                      ? 'bg-[#a9f5d0]/20 text-[#a9f5d0]' 
                      : (selectedSchedule.is_published === true || (selectedSchedule.status || '').toLowerCase() === 'published')
                        ? 'bg-green-500/20 text-green-400'
                        : (selectedSchedule.has_results === true || selectedSchedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((selectedSchedule.status || '').toLowerCase()))
                          ? 'bg-[#c69a53]/20 text-[#c69a53]'
                          : 'bg-alviora-primary/20 text-alviora-primary'
                }`}>
                  {
                    (selectedSchedule.is_published === true || (selectedSchedule.status || '').toLowerCase() === 'published') ? 'PUBLISHED' :
                    (selectedSchedule.has_results === true || selectedSchedule.has_marks === true || ['mark submitted', 'checking pending', 'checking completed'].includes((selectedSchedule.status || '').toLowerCase())) ? 'VERIFICATION PENDING' :
                    selectedSchedule.status || 'Scheduled'
                  }
                </span>
                <h2 className="text-3xl font-bold text-white mb-2 leading-tight">{selectedSchedule.items?.item_name_en || selectedSchedule.items?.name || 'Event Item'}</h2>
                {selectedSchedule.items?.category_name && (
                  <p className="text-alviora-primary text-sm font-bold uppercase tracking-wider">Category: {selectedSchedule.items?.category_name}</p>
                )}
              </div>
              
              {/* Dynamic Status Alert Block */}
              {(() => {
                let stage = {
                  title: "Scheduled",
                  description: "This event is scheduled but has not started yet.",
                  bgColor: "bg-[#009499]/10", borderColor: "border-[#009499]/30", textColor: "text-[#009499]", icon: "schedule"
                };

                const schedStatus = (selectedSchedule.status || '').toLowerCase();
                const resStatus = (selectedSchedule.result_status || selectedSchedule.items?.result_status || '').toLowerCase();
                
                const isPublished = selectedSchedule.is_published === true || selectedSchedule.items?.result_published || schedStatus === 'published' || resStatus === 'published';
                const isUnderVerification = selectedSchedule.has_results === true || ['mark submitted', 'checking pending', 'checking completed', 'mark_submitted', 'checking_pending', 'checking_completed'].includes(schedStatus) || ['mark_submitted', 'checking_pending', 'checking_completed'].includes(resStatus);

                if (isPublished) {
                  stage = {
                    title: "Results Published",
                    description: "The results for this event are now available on the public leaderboard.",
                    bgColor: "bg-green-500/10", borderColor: "border-green-500/30", textColor: "text-green-400", icon: "verified"
                  };
                } else if (isUnderVerification) {
                  stage = {
                    title: "Results Under Verification",
                    description: "Results are currently being verified and will be published soon.",
                    bgColor: "bg-[#c69a53]/10", borderColor: "border-[#c69a53]/30", textColor: "text-[#c69a53]", icon: "rule"
                  };
                } else if (schedStatus === 'completed') {
                  stage = {
                    title: "Competition Ended",
                    description: "This event has successfully concluded. Awaiting evaluations.",
                    bgColor: "bg-[#c69a53]/10", borderColor: "border-[#c69a53]/30", textColor: "text-[#c69a53]", icon: "task_alt"
                  };
                } else if (schedStatus === 'ongoing') {
                  stage = {
                    title: "Live Now",
                    description: "This competition is currently happening at the venue.",
                    bgColor: "bg-red-500/10", borderColor: "border-red-500/30", textColor: "text-red-400", icon: "sensors"
                  };
                }

                return (
                  <div className={`mb-6 ${stage.bgColor} border ${stage.borderColor} rounded-xl p-4 flex items-start gap-3 shadow-sm backdrop-blur-sm`}>
                    <span className={`material-symbols-outlined ${stage.textColor}`}>{stage.icon}</span>
                    <div>
                      <div className={`${stage.textColor} font-bold text-sm`}>{stage.title}</div>
                      <div className={`${stage.textColor} opacity-80 text-xs mt-1`}>{stage.description}</div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-5 mb-8 bg-black/20 p-5 rounded-2xl border border-white/5">
                <div className="flex items-start gap-4 text-alviora-body">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white">location_on</span>
                  </div>
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Venue</div>
                    <div className="text-white font-medium text-lg">{selectedSchedule.venues?.name || 'TBA'}</div>
                    {selectedSchedule.venues?.location && <div className="text-sm mt-1">{selectedSchedule.venues.location}</div>}
                  </div>
                </div>
                
                <div className="h-[1px] w-full bg-white/5"></div>
                
                <div className="flex items-start gap-4 text-alviora-body">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white">event</span>
                  </div>
                  <div>
                    <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Time & Date</div>
                    <div className="text-white font-medium text-lg">
                      {selectedSchedule.start_time ? new Date(selectedSchedule.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'TBA'} 
                      {selectedSchedule.end_time ? ` - ${new Date(selectedSchedule.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
                    </div>
                    <div className="text-sm mt-1">{selectedSchedule.start_time ? new Date(selectedSchedule.start_time).toLocaleDateString([], {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'}) : ''}</div>
                  </div>
                </div>
                
                {selectedSchedule.judges && (
                  <>
                    <div className="h-[1px] w-full bg-white/5"></div>
                    <div className="flex items-start gap-4 text-alviora-body">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white">gavel</span>
                      </div>
                      <div>
                        <div className="text-white/60 text-xs uppercase tracking-widest mb-1">Assigned Judges</div>
                        <div className="text-white font-medium">
                          {Array.isArray(selectedSchedule.judges) ? selectedSchedule.judges.map((j:any) => j.name || j).join(', ') : selectedSchedule.judges}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <button 
                onClick={() => setSelectedSchedule(null)}
                className="w-full bg-white hover:bg-gray-200 text-black py-4 rounded-xl font-bold transition-colors shadow-lg"
              >
                Close Details
              </button>
            </div>
          </div>
        )}

        {/* Top Leaderboard */}
        {(page === 'landing' || page === 'units') && (
        <section id="leaderboard" className={`py-section-gap px-gutter fade-in-up visible relative ${page === 'units' ? '' : 'border-none'}`}>
          
          {/* Subtle Glows in background like the image */}
          <div className="absolute top-1/2 left-0 w-96 h-96 bg-[#1C5FA8]/10 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#1C5FA8]/10 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="max-w-[1200px] mx-auto">
            {/* The main container */}
            <div className="bg-[#121212]/70 backdrop-blur-3xl rounded-[2.5rem] border border-[#333] p-6 lg:p-12 relative overflow-hidden shadow-2xl flex flex-col">
              <div className="hidden lg:flex w-full flex-row gap-12 relative z-10">
              
              {/* Left Side: Text and List */}
              <div className="flex-1 relative z-10 flex flex-col justify-center">
                {/* Rotated Badge removed */}
                
                <div className="pl-0 lg:pl-12">
                  <h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight tracking-tight">
                    <span className="glass-text">Team</span> <span className="inline-block bg-[#1C5FA8] text-white px-4 py-1 rounded-2xl -translate-y-1">Rankings</span>
                  </h2>
                  <p className="text-white/60 text-sm md:text-base mb-10 max-w-md leading-relaxed">
                    Current point standings for the top institutions. Witness the creative and competitive spirit unfold on the grand stage.
                  </p>

                  {/* Top Teams List */}
                  <div className="space-y-4 max-w-md">
                    {topUnits.slice(0, 4).map((unit: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between border border-[#333] bg-[#0A0A0A] hover:bg-[#1A1A1A] hover:border-[#444] transition-all rounded-[2rem] px-6 py-4 cursor-pointer group">
                        <div className="flex items-center gap-6">
                          <span className="font-['Handjet'] text-[#1C5FA8] text-3xl font-bold">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-white font-semibold text-lg">
                            {unit.name || unit.team_name || unit.organisation_name || `Team ${idx + 1}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white/50 text-sm font-medium">{unit.total_points} pts</span>
                          <span className="material-symbols-outlined text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all">arrow_forward</span>
                        </div>
                      </div>
                    ))}
                    {topUnits.length === 0 && (
                      <div className="text-white/50 text-sm italic py-8 text-center border border-[#333] rounded-3xl bg-[#0A0A0A]">Leaderboard data will appear here once results are published.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Bento Grid */}
              {page === 'landing' && (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">
                {/* Main Large Image */}
                <div className="col-span-1 md:col-span-1 md:row-span-2 rounded-[2.5rem] overflow-hidden bg-[#1A1A1A] relative h-[350px] md:h-auto group">
                   <BentoVideo />
                </div>

                {/* Top Right Card */}
                <div className="bg-[#181818] rounded-[2.5rem] border border-[#222] p-8 flex flex-col justify-center gap-6 items-center text-center shadow-lg hover:border-[#333] transition-colors">
                  <p className="text-white/70 text-sm leading-relaxed">Ever wondered how the complete standings look?</p>
                  <button onClick={() => router.push(`/leaderboard/unit-rankings?tenant_id=${tenantId}`)} className="flex items-center gap-3 text-white font-bold text-lg group/btn">
                    See how
                    <br/>they perform
                    <div className="w-10 h-10 rounded-full bg-[#222] border border-[#333] flex items-center justify-center group-hover/btn:bg-[#1C5FA8] group-hover/btn:border-[#1C5FA8] transition-colors shrink-0">
                      <span className="material-symbols-outlined text-sm">north_east</span>
                    </div>
                  </button>
                </div>

                {/* Bottom Right Highlight Card */}
                <div className="bg-[#1C5FA8] rounded-[2.5rem] p-8 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute -right-12 -top-12 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors"></div>
                  
                  <p className="text-white/90 text-sm mb-6 relative z-10 font-medium leading-relaxed">
                    Looking for the leading champions who dominate the festival?
                  </p>
                  
                  <div className="flex items-center justify-between relative z-10">
                     <span className="text-white font-bold text-xl tracking-wide max-w-[100px]">
                       Meet our leader
                     </span>
                     <button onClick={() => router.push(`/leaderboard/unit-rankings?tenant_id=${tenantId}`)} className="w-12 h-12 rounded-full bg-white text-[#1C5FA8] flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform shrink-0">
                       <span className="material-symbols-outlined text-base font-bold">north_east</span>
                     </button>
                  </div>
                </div>

              </div>
              )}

              {/* Right Side: Team Point Posters (Units Page) */}
              {page === 'units' && (
              <div className="flex-1 relative z-10 flex flex-col justify-center items-center bg-[#1A1A1A]/40 rounded-[2.5rem] border border-[#333]/50 p-6 min-h-[400px]">
                <div className="w-full text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">Team Point Posters</h3>
                  <p className="text-white/50 text-sm">Latest updates from the media center</p>
                </div>
                <div className="w-full max-w-sm aspect-square bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl flex items-center justify-center group">
                  {resolvedPosters.length > 0 ? (
                    <>
                      {resolvedPosters.map((url, idx) => (
                        <div 
                          key={idx} 
                          className={`absolute inset-0 transition-opacity duration-1000 ${idx === activePosterIdx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                        >
                          <img src={url} alt="Team Points" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {/* Carousel Indicators */}
                      {resolvedPosters.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          {resolvedPosters.map((_, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActivePosterIdx(idx)}
                              className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === activePosterIdx ? 'bg-alviora-primary w-4' : 'bg-white/40 hover:bg-white/60'}`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 p-8 text-center gap-4">
                       <span className="material-symbols-outlined text-5xl">imagesmode</span>
                       <p>Posters will appear here</p>
                    </div>
                  )}
                </div>
              </div>
              )}
              </div>
              
              {/* Mobile Leaderboard Layout */}
              <div className="flex lg:hidden flex-col w-full gap-8 relative z-10 mt-6">
                <div className="text-center">
                  <h2 className="text-4xl font-bold mb-3 leading-tight tracking-tight">
                    <span className="glass-text">Team</span> <span className="inline-block bg-[#1C5FA8] text-white px-3 py-1 rounded-2xl -translate-y-1 text-xl">Rankings</span>
                  </h2>
                  <p className="text-white/60 text-xs leading-relaxed max-w-[280px] mx-auto">
                    Current point standings for the top institutions.
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full">
                  {topUnits.slice(0,3).map((unit, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-[#222] backdrop-blur-md">
                      <div className="flex items-center gap-4">
                        <span className="text-[#1C5FA8] font-['Handjet'] font-bold text-3xl">{(index + 1).toString().padStart(2, '0')}</span>
                        <span className="text-white font-bold text-base">{unit.title || unit.name || unit.organisation_name || `Team ${index + 1}`}</span>
                      </div>
                      <span className="text-white/70 text-xs font-bold bg-white/10 px-3 py-1 rounded-full">{unit.total_points || 0} pts</span>
                    </div>
                  ))}
                  {topUnits.length === 0 && (
                    <div className="text-white/50 text-sm italic py-6 text-center border border-[#333] rounded-2xl bg-black/40">Leaderboard data will appear here.</div>
                  )}
                </div>

                {page === 'units' && (
                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative aspect-square border border-[#333] shadow-lg flex flex-col items-center justify-center">
                  {resolvedPosters.length > 0 ? (
                    <>
                      {resolvedPosters.map((url, idx) => (
                        <div 
                          key={idx} 
                          className={`absolute inset-0 transition-opacity duration-1000 ${idx === activePosterIdx ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                        >
                          <img src={url} alt="Team Points" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {resolvedPosters.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                          {resolvedPosters.map((_, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActivePosterIdx(idx)}
                              className={`w-2 h-2 rounded-full transition-all duration-300 ${idx === activePosterIdx ? 'bg-alviora-primary w-4' : 'bg-white/40 hover:bg-white/60'}`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <span className="material-symbols-outlined text-4xl text-white/30 mb-2">imagesmode</span>
                      <p className="text-white/30 text-sm">Team Posters</p>
                    </div>
                  )}
                </div>
                )}

                {page === 'landing' && (
                <div className="w-full rounded-[2rem] overflow-hidden bg-[#1A1A1A] relative h-[200px] border border-[#333] shadow-lg group">
                  <BentoVideo />
                </div>
                )}

                {page === 'landing' && (
                <button onClick={() => router.push(`/leaderboard/unit-rankings?tenant_id=${tenantId}`)} className="w-full mt-2 bg-white text-[#1C5FA8] font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                  See full standings
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                )}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Item Results Section */}
        {page === 'items' && (
        <section id="item-results" className="bg-transparent backdrop-blur-sm py-section-gap px-gutter border-alviora-border fade-in-up visible">
          <div className="max-w-container-max mx-auto">
              <div className="text-center mb-10">
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-4">Published Results</h2>
                <p className="font-body-lg text-body-lg text-alviora-body">Latest competition results.</p>
              </div>

              {/* Search & Filter Controls */}
              <div className="mb-10 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/40">search</span>
                  <input 
                    type="text" 
                    placeholder="Search by item name..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-11 pr-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-alviora-primary/50 transition-all"
                  />
                </div>
                
                {availableCategories.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`whitespace-nowrap px-4 py-2 rounded-full border transition-all text-sm font-bold tracking-wider ${!selectedCategory ? 'bg-alviora-primary text-black border-alviora-primary' : 'bg-transparent text-white/70 border-white/20 hover:border-white/40 hover:text-white'}`}
                    >
                      ALL
                    </button>
                    {availableCategories.map((cat: string) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`whitespace-nowrap px-4 py-2 rounded-full border transition-all text-sm font-bold tracking-wider uppercase ${selectedCategory === cat ? 'bg-alviora-primary text-black border-alviora-primary' : 'bg-transparent text-white/70 border-white/20 hover:border-white/40 hover:text-white'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
              {groupedItemResults.length > 0 ? groupedItemResults.map((result: any, idx: number) => {
                const poster = generatedPosters.find((p: any) => p.result_id === result.result_id || (p.item_id && p.item_id === result.item_id));
                return (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-md flex flex-col md:flex-row gap-6 items-center">
                  <div className="flex-1 w-full">
                    <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white mb-1">{result.item_name}</h3>
                        {result.category && <span className="text-alviora-primary text-sm font-bold uppercase tracking-wider">{result.category}</span>}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {result.participants.sort((a:any,b:any) => a.position - b.position).map((p: any, pIdx: number) => (
                        <div key={pIdx} className="flex items-center gap-4 bg-black/20 p-3 rounded-lg border border-white/5">
                          <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold ${p.position === 1 ? 'bg-[#FBBF24] text-black' : p.position === 2 ? 'bg-[#D1D5DB] text-black' : p.position === 3 ? 'bg-[#D97706] text-white' : 'bg-[#333] text-white'}`}>
                            {p.position}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-white">{p.name || p.chest_no}</div>
                            <div className="text-xs text-white/60">{p.organisation_name || ''} {p.grade ? ` • Grade: ${p.grade}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {poster && poster.resolved_url && (
                    <div className="w-full md:w-1/3 flex flex-col items-center justify-center">
                      <img src={poster.resolved_url} alt="Result Poster" className="w-full max-w-[280px] rounded-xl shadow-2xl border border-white/20 hover:scale-105 transition-transform cursor-pointer" onClick={() => window.open(poster.resolved_url, '_blank')} />
                      <span className="text-xs text-white/40 mt-3 font-['Handjet'] tracking-widest uppercase">Official Result Poster</span>
                    </div>
                  )}
                </div>
              )}) : (
                <div className="p-12 text-center text-alviora-body bg-white/5 rounded-xl border border-white/10">
                  No results published yet.
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* Festival Gallery (Bento Grid) */}
        {false && page === 'landing' && (
        <section className="px-gutter py-section-gap max-w-container-max mx-auto fade-in-up visible handjet-wrapper">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-12 text-center">Festival Highlights</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 auto-rows-[250px]">
            {/* Item 1 - 2x2 Large */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-2 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Exhibition" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-6 left-6 z-20">
                <span className="bg-alviora-primary px-3 py-1 rounded text-xs font-label-sm text-label-sm uppercase tracking-wider text-white mb-2 inline-block shadow-sm">Exhibition</span>
                <h3 className="font-title-md text-title-md text-white text-2xl font-bold shadow-sm">Digital Revelation</h3>
              </div>
            </div>
            {/* Item 2 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-md border-outline-variant/50">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Calligraphy" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Calligraphy</h3>
              </div>
            </div>
            {/* Item 3 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Poetry" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Poetry</h3>
              </div>
            </div>
            {/* Item 4 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Digital Art" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Digital Art</h3>
              </div>
            </div>
            {/* Item 5 - 2x1 Wide */}
            <div className="hover:-translate-y-1 transition-transform duration-300 md:col-span-2 md:row-span-1 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Music" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlWdOx1GT_6qOiL3HZl5bMMZ5aHYVxUKF1eGXRLuiqbEoaDmWM7iIQYMs0PPePIwGfHJP0_kSdXD6c6MeuF405pzxPvgLy0iztBBrKhubgUyCAwFfzna8gx3ED5LWoQeaKCZWnCwSbRvGNjrL6lc0YDiZRUouj4Vh_wdAWsB1N5-Ggxwnwhfnwyhlr-0DsO_jKKw4yEGRifFh71JEefw1L26cHrwHojOzN1vFfZLz1-tut3vcNTF4"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Musical Ensemble</h3>
              </div>
            </div>
            {/* Item 6 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Theatre" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2hur9R9QCUF4RNNsDw8aIzfgK4nePkRKy3qxS69_zd6bCOnAL_VknVF6gKs_KEDrYfAjXaZPPO9dJCJR7Jf_MPCZj1WslcxEdpVz1kr5Ac3hCBvPrGqZDdGHzIrk3rVmqM-Rst6KMz9tDGceA7V2uQR2pz0XYCNm_wHiB6J7FCPgUVgkewF3dtKWZA7E82vb8serSapoyY0POVvlx6vImJOZBaGrootSvELASRr58K4bpphM8a6Q"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Live Theatre</h3>
              </div>
            </div>
            {/* Item 7 - 1x1 Small */}
            <div className="hover:-translate-y-1 transition-transform duration-300 rounded-xl overflow-hidden relative group border border-alviora-border shadow-sm">
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors z-10"></div>
              <img className="w-full h-full object-cover" data-alt="Storytelling" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBk9KhsHmCPhzPZXq5wU4DKsYPV_558HpIqcjKqnFzIQpHrVP0OSPPL57tBkjo1iQ9AWQIcc0Qoytr0vj8OSTooDqZlJO2dke4xY1bZLKgUtmb-UU6cQCU_eH9kvCsa1mPEWNsHeZbGIFSPLrfqBOQqKCI8ag2OEoJEa1x6I4gQ7eWviRUl5BUPHGtMjB_ZUM3BIYkqNoHMXU0SFOWo8L7oMfKTqIE0Dr_0YqUsHnm2Nhn_pj9c7Ng"/>
              <div className="absolute bottom-4 left-4 z-20">
                <h3 className="font-title-md text-title-md text-white font-bold shadow-sm">Storytelling</h3>
              </div>
            </div>
          </div>
        </section>
        )}
            </div>
          </div>
        </>
        )}
      </main>

      
        {/* Marquee Section */}
        {page === 'landing' && (
          <div className="w-full overflow-hidden bg-transparent py-16 border-t border-white/5">
            <div className="flex whitespace-nowrap animate-marquee">
              <span className="text-5xl md:text-7xl font-bold text-white/90 mx-4 font-['Handjet'] tracking-wider">Innovate <span className="text-[#1C5FA8] mx-2">+</span> Inspire <span className="text-[#c69a53] mx-2">+</span> Create <span className="text-[#1C5FA8] mx-2">+</span> Discover <span className="text-[#c69a53] mx-2">+</span></span>
              <span className="text-5xl md:text-7xl font-bold text-white/90 mx-4 font-['Handjet'] tracking-wider">Innovate <span className="text-[#1C5FA8] mx-2">+</span> Inspire <span className="text-[#c69a53] mx-2">+</span> Create <span className="text-[#1C5FA8] mx-2">+</span> Discover <span className="text-[#c69a53] mx-2">+</span></span>
            </div>
          </div>
        )}

        {children}
        {/* Footer */}
      <footer className="bg-black/40 backdrop-blur-md border-t border-white/5 full-width mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center px-gutter py-8 max-w-container-max mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start">
            <a className="font-bold tracking-tighter inline-block" href="#">
              <span className="text-2xl uppercase keep-font" style={{fontFamily:"Barabara, sans-serif",fontWeight:"normal",letterSpacing:"0.05em",color:"#c69a53"}}>FESTOS</span>
            </a>
            <p className="font-['Handjet'] text-sm text-white/50 mt-2">Art Rooted in Revelation. A celebration of the sacred and the beautiful.</p>
          </div>
          
          <div className="flex gap-4">
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">language</span>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">photo_camera</span>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all">
              <span className="material-symbols-outlined text-xl">play_circle</span>
            </a>
          </div>
        </div>
        
        <div className="border-t border-white/5 py-4 px-gutter bg-transparent">
          <div className="max-w-container-max mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
            <div className="font-['Handjet'] text-xs text-white/40">© {new Date().getFullYear()} Festos. All rights reserved.</div>
            <div className="flex gap-4 font-['Handjet'] text-xs text-white/40">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}











