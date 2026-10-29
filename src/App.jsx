import { useState, useEffect, useCallback, useRef, lazy } from "react";
import { API_URL } from "./services/api"; // http://192.168.0.125:8000/api
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import TopBar from "./components/TopBar";
import SaveStrategyModal from "./components/SaveStrategyModal";
import Toast from "./components/Toast";
import { saveStrategy, updateStrategy, buildSaveStrategyPayload } from "./services/strategyApi";
import { StrategyProvider, useStrategy } from "./context/StrategyContext";
import { PortfolioProvider } from "./context/PortfolioContext";
import { SavedStrategiesProvider, useSavedStrategies } from "./context/SavedStrategiesContext";
import logger from './utils/logger';
import { revealSection, INSTRUMENT_SECTION_ID } from './utils/revealSection';
import { colors } from './theme/colors';
import { ChevronsRight } from 'lucide-react';
import LazyTab, { LazyTabBoundary } from './components/LazyTab';
import SelectPopup from './components/SelectPopup';
import AuthPage from './auth/AuthPage';
import { hasValidSession, clearSession } from './auth/authSession';
import { resetAttempts } from './auth/loginAttempts';
import { decodeBackendStrategy } from './utils/backendStrategyDecode';
import { resetAlgoTab } from './components/algotrade/tabMemory';
import { fetchStrategies } from './services/libraryApi';
import { refreshLibrary } from './services/strategyLibrary';
import { subscribeLive } from './services/liveSocket';
import useUrlTab, { initialTab } from './hooks/useUrlTab';

// Lazy load heavy components (loaded only when needed)
const StrategyBuilder = lazy(() => import("./components/StrategyBuilder"));
const Reports = lazy(() => import("./components/Reports"));
const Portfolios = lazy(() => import("./components/Portfolios"));
const SavedStrategiesList = lazy(() => import("./components/SavedStrategiesList"));
const AlgoTrade = lazy(() => import("./components/AlgoTrade"));


// Shown only while a lazily-loaded tab's chunk is still arriving. The old
// full-screen countdown overlay used to serve double duty here; backtest
// progress now lives in the Start Backtest button instead.
const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <span className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin" />
  </div>
);

function App() {
  // The signed-out screen stands in FRONT of the providers: until there is a
  // session there is no strategy or portfolio work to hold, and mounting the
  // whole app behind a sign-in page would run its localStorage hydration for
  // nothing.
  const [signedIn, setSignedIn] = useState(() => hasValidSession());
  // Which view the auth page opens on: the landing page for a visitor, the
  // login card for someone who has just signed out.
  const [authView, setAuthView] = useState('landing');

  // The 6-hour window can run out while the tab is open, so watch for it
  // rather than only checking at mount. A minute's granularity is plenty and
  // costs nothing; the exact expiry is enforced by readSession either way.
  useEffect(() => {
    if (!signedIn) return undefined;
    const timer = setInterval(() => {
      if (!hasValidSession()) setSignedIn(false);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [signedIn]);

  if (!signedIn) {
    return (
      <>
        <SelectPopup />
        <AuthPage initialView={authView} onEnter={() => setSignedIn(true)} />
      </>
    );
  }

  // Signing out drops the session AND its token, then puts the login card up —
  // not the landing page, so the next sign-in is one step away.
  const handleLogout = () => {
    resetAlgoTab();           // the next session starts on Strategies
    clearSession();
    resetAttempts();          // a new sign-in starts with all five attempts
    setAuthView('login');
    setSignedIn(false);
  };

  return (
    <LazyTabBoundary fallback={<TabFallback />}>
      {/* Inert unless the platform draws select lists badly — see SelectPopup. */}
      <SelectPopup />
      <StrategyProvider>
        <SavedStrategiesProvider>
        <PortfolioProvider>
          <AppContent onLogout={handleLogout} />
        </PortfolioProvider>
        </SavedStrategiesProvider>
      </StrategyProvider>
    </LazyTabBoundary>
  );
}

function AppContent({ onLogout }) {
  const { 
    strategy_id: contextStrategyId,
    strategy_name: contextStrategyName,
    version: contextVersion,
    updateStrategyData,
    getVersionByName,
    clearStrategyData
  } = useStrategy();

  // The saved strategies live here now — state mirrored to localStorage, so a
  // save is visible to every screen at once and survives a refresh.
  const { upsertStrategy, findByName, hasName } = useSavedStrategies();
  
  /*
    Seeded FROM THE URL so a refresh or a shared link opens the screen the
    address bar names, not always the builder. `initialTab` falls back to
    "builder" for "/" and for any path this build does not route.
    The address bar is kept in step by useUrlTab, wired up further down --
    it needs setAlgoEntry, which is declared below this line.
  */
  const [activeTab, setActiveTab] = useState(initialTab);

  /**
   * PART A -- ONE LIVE SOCKET PER SESSION.
   *
   * Every live subscriber sits inside Algo Trade, so leaving the tab dropped
   * the count to zero and closed the socket; coming back opened a new one.
   * This holds one subscription from the first visit until the app unmounts.
   * Starts on first use, not at login. The callback does nothing on purpose --
   * storing the snapshot here would re-render the whole app once a second.
   */
  const [liveEverOpened, setLiveEverOpened] = useState(false);

  /*
    Latched DURING RENDER, not in an effect: React's documented way to derive
    state from a changed value, and the lint rule here rejects setState inside
    an effect for exactly this (it costs an extra render pass). The guard makes
    it run once and never loop.

    The tab string is "algo-trade" -- the same literal the render below tests.
  */
  if (activeTab === "algo-trade" && !liveEverOpened) setLiveEverOpened(true);

  useEffect(() => {
    if (!liveEverOpened) return undefined;
    return subscribeLive(() => {});
  }, [liveEverOpened]);
  const [backtestResults, setBacktestResults] = useState(null);
  /**
   * TRUE ONLY WHILE A BACKTEST IS RUNNING. It drives the action bar's button,
   * which reads "Running Backtest" while it is set.
   *
   * Loading a strategy used to set this too, so opening one from the sidebar
   * flipped the button to "Running Backtest" without a backtest existing --
   * obvious when clicking through saved strategies quickly, because the loads
   * overlap and the label stuck. Strategy loading has its own flag below.
   */
  const [isLoading, setIsLoading] = useState(false);
  /** True while a saved strategy is being fetched into the builder. */
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);
  const [strategyConfig, setStrategyConfig] = useState({});
  // Set only between a .algtst import and the builder taking it over; see
  // handleImportStrategy for why the import cannot simply go into strategyConfig.
  const [importedConfig, setImportedConfig] = useState(null);
  // True for the instant a reset/load is replacing the strategy on screen; see
  // handleConfigChange.
  // Which generation of StrategyBuilder is the live one. Every reset bumps it,
  // the builder is keyed AND stamped with it, and handleConfigChange drops any
  // push that does not carry the current value — see there for why.
  const [builderGeneration, setBuilderGeneration] = useState(0);
  const generationRef = useRef(0);
  // What StrategyBuilder has on screen right now, ahead of the debounced push
  // into strategyConfig. Export reads this so it can never write a stale file.
  const liveConfigRef = useRef(null);
  // Stable wrapper around handleLoadStrategyFromBackend (which is rebuilt every
  // render). Passing the raw function to a memoised screen would defeat its
  // memo; this keeps one identity while always calling the current version.
  const loadStrategyRef = useRef(null);
  const openStrategyInBuilder = useCallback(
    (strategyId, strategyName, version) => loadStrategyRef.current?.(strategyId, strategyName, version),
    [],
  );

  // Deploy screen -> the app's own Portfolios screen, opened on the named
  // portfolio's detail page. Stable identity, for the memoised AlgoTrade.
  const [openPortfolioName, setOpenPortfolioName] = useState(null);
  const goToPortfolios = useCallback((name) => {
    setOpenPortfolioName(name || null);
    setActiveTab('portfolios');
  }, []);
  const clearOpenPortfolio = useCallback(() => setOpenPortfolioName(null), []);

  const beginStrategyReset = useCallback(() => {
    // The ref is written here, in the event handler, and the updater below is
    // left pure: React may call an updater more than once for a single update,
    // and a ref bumped inside one ends up ahead of the state it mirrors — which
    // would make every later push look stale and be dropped.
    const next = generationRef.current + 1;
    generationRef.current = next;
    setBuilderGeneration(next);
  }, []);
  // True while the builder is showing a strategy that came from a file. The
  // Import button hides then: importing over an import would throw away the
  // strategy the user is in the middle of reviewing.
  const [strategyImported, setStrategyImported] = useState(false);
  // Open by default, but not on a window too narrow to hold both it and the
  // page. Below ~980px the sidebar's ~165px is the difference between the
  // tables fitting and their columns being crushed — on a rotated monitor with
  // a half-width window the strategy NAME was squeezed to nothing.
  //
  // matchMedia, not a resize listener: it fires only when the threshold is
  // actually crossed, so this costs nothing while the user drags a window, and
  // a sidebar they open by hand on a narrow screen stays open.
  const NARROW = '(max-width: 980px)';
  const [mainSidebarOpen, setMainSidebarOpen] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia?.(NARROW).matches),
  );

  useEffect(() => {
    const mq = window.matchMedia?.(NARROW);
    if (!mq) return undefined;
    const onCross = (e) => { if (e.matches) setMainSidebarOpen(false); };
    mq.addEventListener('change', onCross);
    return () => mq.removeEventListener('change', onCross);
  }, []);
  // The sidebar's state is only ever changed by the user's own clicks — with
  // one exception: the Pro view hides it (it brings a rail of its own) and
  // leaving Pro restores whatever the user had. The stash lives in refs so the
  // callbacks handed to the memoised AlgoTrade stay identity-stable.
  const mainSidebarOpenRef = useRef(true);
  useEffect(() => { mainSidebarOpenRef.current = mainSidebarOpen; });

  // How the Algo Trade tab is entered: 'main' from the sidebar, 'broker' from
  // the top bar's Broker Setup. The seq keys the component, so a Broker Setup
  // click lands on the broker screen even when Algo Trade is already open.
  const [algoEntry, setAlgoEntry] = useState({ view: 'main', seq: 0 });
  const openBrokerSetup = useCallback(() => {
    setAlgoEntry((was) => ({ view: 'broker', seq: was.seq + 1 }));
    setActiveTab('algo-trade');
  }, []);

  /**
   * The top bar's "Algo Trade" — always lands on the MAIN board.
   *
   * Plain setActiveTab did nothing when already on Algo Trade (same tab = no-op,
   * so Broker Setup stayed up), and reopened on Broker Setup from elsewhere
   * because `algoEntry.view` was still 'broker'. Bumping `seq` re-keys the
   * component so it rebuilds either way; resetAlgoTab returns it to Strategies.
   */
  const openAlgoTrade = useCallback(() => {
    resetAlgoTab();
    setAlgoEntry((was) => ({ view: 'main', seq: was.seq + 1 }));
    setActiveTab('algo-trade');
  }, []);

  /** Top-bar navigation. Algo Trade needs more than a tab switch; see above. */
  const navigateFromTopBar = useCallback((tab) => {
    if (tab === 'algo-trade') { openAlgoTrade(); return; }
    setActiveTab(tab);
  }, [openAlgoTrade]);

  /**
   * BACK / FORWARD. The browser has already changed the URL by the time this
   * runs, so this only has to bring the screen into line with it.
   *
   * Algo Trade is re-entered on its MAIN board: Broker Setup shares the
   * /algo-trade URL (it is a view inside the tab, not a route of its own), so
   * without this, stepping back onto /algo-trade would reopen whichever inner
   * screen was last shown rather than the board the URL stands for.
   */
  const applyTabFromHistory = useCallback((tab) => {
    if (tab === 'algo-trade') {
      resetAlgoTab();
      setAlgoEntry((was) => ({ view: 'main', seq: was.seq + 1 }));
    }
    setActiveTab(tab);
  }, []);

  useUrlTab(activeTab, applyTabFromHistory);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const [strategyId, setStrategyId] = useState(null);
  
  const [versionLoadCounter, setVersionLoadCounter] = useState(0);
  
  const [saveStatus, setSaveStatus] = useState(null); // 'loading' | 'success' | 'error' | null
  const [saveMessage, setSaveMessage] = useState('');
  
  const [strategiesRefreshKey, setStrategiesRefreshKey] = useState(0);
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // One stable toast callback. AlgoTrade is memoised, so an inline arrow here
  // would change identity every render and defeat the memo.
  const notify = useCallback((message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  }, []);

  
  const [strategySavedInSession, setStrategySavedInSession] = useState(false);

  const [saveCompletedCounter, setSaveCompletedCounter] = useState(0);
  const [backtestCompletedCounter, setBacktestCompletedCounter] = useState(0);

  const handleRunBacktest = async (payload) => {
    setIsLoading(true);

    try {
      if (!payload.strategy || !payload.legs) {
        throw new Error("Invalid payload structure: missing strategy or legs");
      }

      const endpoint = `${API_URL}/run-backtest`;
      
      logger.request('[RUN BACKTEST] Request', { 
        method: 'POST',
        url: endpoint,
        body: payload
      });

      let data = null;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const rawBody = await response.text();
      let jsonData;
      try {
        jsonData = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new Error(`Server returned invalid JSON (status ${response.status})`);
      }

      if (response.ok) {
        data = jsonData;
        
        logger.response('[RUN BACKTEST] Response', { 
          status: response.status,
          data: data
        });
        
      } else {
        const errorMessage = jsonData.error || jsonData.message || "Backend request failed";
        logger.error("Backend Error Response:", jsonData);
        logger.error("════════════════════════════════════════════════════════");
        logger.error("BACKTEST FAILED");
        logger.error("════════════════════════════════════════════════════════");
        logger.error("Error:", errorMessage);
        logger.error("Status Code:", response.status);
        logger.error("Full Error Response:", JSON.stringify(jsonData, null, 2));
        logger.error("════════════════════════════════════════════════════════");
        
        if (errorMessage.toLowerCase().includes('no chain data') || 
            errorMessage.toLowerCase().includes('no data found')) {
          // Single line: this surfaces in a toast now, not a native alert box.
          throw new Error(
            `No trading data found for ${payload.strategy.start_date} to ${payload.strategy.end_date}. Check the dates and click "Load Data" first.`
          );
        }
        
        throw new Error(errorMessage);
      }

      if (data.status === "error" || data.error) {
        throw new Error(data.error || "Backtest failed");
      }

      let resultsToSet = data;
      if (data.results && !data.data) {
        resultsToSet = data.results;
      }
      
      setBacktestResults(resultsToSet);
      
      // Increment counter to notify StrategyBuilder that backtest completed
      // This triggers compare data refresh in StrategyBuilder
      console.log('[App] Backtest completed, incrementing backtestCompletedCounter');
      setBacktestCompletedCounter(prev => prev + 1);
    } catch (error) {
      logger.error("Backtest failed:", error);
      // Red toast instead of a native alert() — the browser draws alert() as a
      // "localhost says" dialog that cannot be styled and looks different on
      // every OS. The console still gets the full error via logger.error above.
      setToastMessage(`Backtest failed: ${error.message}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = useCallback((config, generation) => {
    // StrategyBuilder flushes whatever it has pending when it unmounts. If the
    // unmount was caused by a deliberate reset — "New Strategy", opening a
    // saved strategy, loading one from a report — that flush arrives AFTER the
    // new config was set and would put the old strategy straight back: clicking
    // "New Strategy" left the form showing the strategy it had just left.
    //
    // Every builder is mounted for one generation (versionLoadCounter, which
    // also keys it) and stamps its pushes with it, so a push from the builder
    // being torn down is recognised and dropped. This used to be a one-tick
    // timer instead, which the import path outran: the remount commit landed
    // after the tick, the flush was let through, and "New Strategy" after an
    // import showed the imported strategy again.
    if (generation !== undefined && generation !== generationRef.current) return;

    setStrategyConfig(config);
    // An import hands the builder its config directly (see handleImportStrategy).
    // The moment the builder pushes a config with legs back, it owns the
    // imported strategy and strategyConfig is in step, so the override goes.
    setImportedConfig((pending) => (pending && config?.legs?.length ? null : pending));
  }, []);

  const handleLoadConfigFromReport = (config) => {
    beginStrategyReset();
    setStrategyConfig(config);
    setImportedConfig(null);   // see handleCreateNewStrategy
    // Same reason as handleLoadStrategyFromBackend: don't carry another run's
    // results into a config that was just loaded from a report.
    setBacktestResults(null);
    setTimeout(() => {
      setActiveTab("builder");
    }, 0);
  };

  const handleLoadStrategyFromBackend = async (strategyId, strategyName, specificVersion = null) => {
    try {
      
      setIsLoadingStrategy(true);
      
      let versionToRequest = specificVersion; // Use specific version if provided
      
      // If no specific version provided, try to find the latest
      if (versionToRequest === null) {
        // Priority 1: Check if context has version for THIS specific strategy
        if ((contextStrategyId === strategyId || contextStrategyName === strategyName) && contextVersion !== null) {
          versionToRequest = contextVersion;
          logger.request('[GET STRATEGY] Version from context', { contextVersion, contextStrategyId, contextStrategyName });
        }
        
        // Priority 2: the saved strategy itself. Its card carries the id and the
        // version the backend last returned for this name, which is exactly
        // what this request needs — and it comes from context, so it is current
        // even for a strategy saved moments ago on another screen.
        if (versionToRequest === null && strategyName) {
          versionToRequest = findByName(strategyName)?.version ?? null;
          logger.request('[GET STRATEGY] Version from the saved strategy', { strategyName, version: versionToRequest });
        }

        // Priority 3: the older name -> version map, for cards saved before
        // versions were kept on them.
        if (versionToRequest === null && strategyName) {
          versionToRequest = getVersionByName(strategyName);
          logger.request('[GET STRATEGY] Version from VERSION_MAP', { strategyName, version: versionToRequest });
        }
        
        // Priority 4: Check strategy_session_data as last resort
        if (versionToRequest === null) {
          try {
            const storedData = JSON.parse(localStorage.getItem('strategy_session_data') || '{}');
            if (storedData.strategy_id === strategyId && storedData.version) {
              versionToRequest = storedData.version;
              logger.request('[GET STRATEGY] Version from strategy_session_data', { storedData });
            }
          } catch {
            // localStorage read failed, continue without version
          }
        }

        // Priority 5: ASK THE BACKEND.
        //
        // Every lookup above reads localStorage — the context, the saved cards,
        // the name->version map, the session blob. All four are written on the
        // machine that saved the strategy, so on any OTHER machine they return
        // null together, the request went out with no `version` at all, and the
        // backend rejected it (422). The strategies list carries the current
        // version and reads the same everywhere, so it is the one source that
        // cannot go missing.
        if (versionToRequest === null) {
          try {
            const rows = await fetchStrategies();
            const match = rows.find((r) => String(r.id) === String(strategyId))
              || rows.find((r) => String(r.name).trim() === String(strategyName ?? '').trim());
            versionToRequest = match?.version ?? null;
            logger.request('[GET STRATEGY] Version from the backend list', { strategyName, version: versionToRequest });
          } catch (listError) {
            logger.error('[GET STRATEGY] Could not read the strategy list for a version', listError);
          }
        }
      }
      
      logger.request('[GET STRATEGY] Final version to request', { versionToRequest, strategyId, strategyName });
      
      let apiUrl = `${API_URL}/get-strategy?strategy_id=${encodeURIComponent(strategyId)}&strategy_name=${encodeURIComponent(strategyName)}`;
      
      // ALWAYS send a version. Leaving it off is what produced the 422: the
      // backend treats it as required. 1 is only ever reached when the backend
      // list itself could not supply one, so it is logged rather than silent.
      if (versionToRequest === null) {
        logger.error('[GET STRATEGY] No version could be resolved; falling back to 1', { strategyId, strategyName });
      }
      apiUrl += `&version=${versionToRequest ?? 1}`;
      
      logger.request('[GET STRATEGY] Request', { 
        method: 'GET',
        url: apiUrl,
        parameters: {
          strategy_id: strategyId,
          strategy_name: strategyName,
          version: versionToRequest
        }
      });
      
      const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load strategy: ${response.status}`);
      }

      const result = await response.json();
      
      logger.response('[GET STRATEGY] Response', { 
        status: response.status,
        data: result
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load strategy data');
      }

      const { strategy } = result.data;

      const versionNumber = strategy.version || result.data.version || 1;

      updateStrategyData(strategyId, strategyName, versionNumber);
      logger.context('Strategy data stored', { strategyId, strategyName, version: versionNumber });

      // The response -> config mapping lives in backendStrategyDecode (one
      // decoder, shared with the portfolio export). See that module.
      const loadedConfig = decodeBackendStrategy(result.data, strategyName);

      beginStrategyReset();
      setStrategyConfig(loadedConfig);

      setStrategyImported(false);
      setImportedConfig(null);   // see handleCreateNewStrategy

      setStrategyId(strategyId);

      setStrategySavedInSession(true);

      // The results on screen belong to whichever strategy was run before this
      // one — showing them under a freshly opened strategy would attribute
      // another strategy's trades to it.
      setBacktestResults(null);

      setActiveTab('builder');

      /*
        Put the user at the top of the strategy they just opened.

        Clicking a saved strategy while scrolled down -- reading legs, or a
        previous run's results -- used to leave the page at that same offset,
        so the new strategy appeared already scrolled past its own beginning.

        It only moves when Instrument settings is NOT already on screen: if the
        user is looking at it, their scroll position is left alone. The helper
        waits for the section to render, because the builder remounts (its key
        changes) and its chunk may still be loading.
      */
      revealSection(INSTRUMENT_SECTION_ID);

      setToastMessage(`Strategy "${strategyName}" loaded successfully!`);
      setToastType('success');
      setShowToast(true);

      setIsLoadingStrategy(false);

    } catch (error) {
      logger.error('[App] Error loading strategy from backend:', error);
      
      setToastMessage(`Failed to load strategy: ${error.message}`);
      setToastType('error');
      setShowToast(true);

      setIsLoadingStrategy(false);
    }
  };

  // Kept as an every-render ref sync so the stable openStrategyInBuilder above
  // always calls the freshest loader. Placed after the declaration it mirrors —
  // effects run post-render, so the position changes nothing at runtime.
  useEffect(() => { loadStrategyRef.current = handleLoadStrategyFromBackend; });

  const handleLoadVersion = async (strategyId, versionNumber) => {
    try {
      setIsLoadingStrategy(true);
      
      const strategyName = contextStrategyName || strategyConfig.strategy_name;
      
      if (!strategyName) {
        throw new Error('Strategy name not found');
      }

      // Use the main strategy loading function which has proper transformation logic
      await handleLoadStrategyFromBackend(strategyId, strategyName, versionNumber);
      
      setIsLoadingStrategy(false);
    } catch (error) {
      logger.error('[App] Error loading version:', error);
      setIsLoadingStrategy(false);
      setToastMessage(`Failed to load version: ${error.message}`);
      setToastType('error');
      setShowToast(true);
    }
  };

  // Both refs below are refs, not state, on purpose: they are only read inside
  // the submit handler, so setting them must not re-render the whole app shell.
  //
  // The builder hands us its live config when Save / Save As New is pressed.
  // The modal only reports the typed NAME back, so the config is parked here
  // for the moment the user confirms. Holding one existing object reference
  // costs nothing — no copy, no serialisation.
  const pendingSaveConfigRef = useRef(null);
  const saveAsNewRef = useRef(false);

  // asNew=true -> "Save As New": the payload goes out WITHOUT strategy_id, which
  // is what tells the backend to mint a fresh strategy rather than add a version.
  // silent: suppress the SUCCESS toast only. Used by the auto-save that runs
  // before a backtest, where the user asked for a backtest and not for a save
  // confirmation. Failures still toast — a save that goes wrong is never hidden.
  const handleSaveStrategy = async (strategyName, configToSave = null, asNew = false, viaUpdateButton = false, silent = false) => {
    // Use provided config or fallback to strategyConfig
    const config = configToSave || strategyConfig;
    
    if (!config.legs || config.legs.length === 0) {
      setSaveStatus('error');
      setSaveMessage('At least one leg is required to save strategy');
      // saveMessage alone has no on-screen home here, so this used to be a dead
      // click with no feedback at all. Surface it like every other failure.
      setToastMessage('At least one leg is required to save strategy');
      setToastType('error');
      setShowToast(true);
      return; // Don't proceed, wait for user to add legs
    }

    if (!strategyName || strategyName.trim() === '') {
      setSaveStatus('error');
      setSaveMessage('Strategy name is required');
      setTimeout(() => setSaveStatus(null), 5000);
      throw new Error('Strategy name is required');
    }

    if (!strategyId || strategyId === -999 || strategyId === '-999') {
      {
        // From context, so a strategy saved a moment ago on another screen
        // counts — a fresh localStorage read could still miss it.
        const duplicateExists = hasName(strategyName);

        if (duplicateExists) {
          setSaveStatus('error');
          setSaveMessage('A strategy with the same name already exists for this user. Please choose a different strategy name.');
          
          setToastMessage('A strategy with the same name already exists for this user. Please choose a different strategy name.');
          setToastType('error');
          setShowToast(true);
          
          setTimeout(() => setSaveStatus(null), 5000);
          return; // Don't proceed with save
        }
      }
    }

    setSaveStatus('loading');
    setSaveMessage('Saving strategy...');

    try {
      if (!config.symbol || !config.start_date || !config.end_date) {
        setSaveStatus('error');
        setSaveMessage('Missing required strategy configuration');
        setTimeout(() => setSaveStatus(null), 5000);
        throw new Error('Missing required strategy configuration');
      }

      if (!config.legs || config.legs.length === 0) {
        setSaveStatus('error');
        setSaveMessage('At least one leg is required');
        setTimeout(() => setSaveStatus(null), 5000);
        throw new Error('At least one leg is required');
      }

      const requestBody = buildSaveStrategyPayload({
        ...config,
        strategy_name: strategyName
      }, 1); // Version parameter is ignored now (removed from payload)

      // CRITICAL: Always pass strategy_id when updating an existing strategy
      // This ensures backend creates a new version instead of treating it as a new strategy
      // Drives both the request shape and the wording of the success toast:
      // "Update" writes a new version of an existing strategy, everything else
      // creates one.
      const isUpdate = Boolean(!asNew && strategyId && strategyId !== -999 && strategyId !== '-999');

      if (isUpdate) {
        requestBody.strategy.strategy_id = strategyId;
        console.log('[App] Updating existing strategy with ID:', strategyId);
      } else {
        // Save As New (or a first-time save): id stays null in the request.
        requestBody.strategy.strategy_id = null;
        console.log('[App] Creating new strategy', asNew ? '(Save As New)' : '');
      }

      logger.request('/save-strategy', requestBody);

      // The ENDPOINT is chosen by intent, not by whether the strategy exists:
      // only the Update button PUTs to /api/update-strategy. isUpdate still
      // governs the payload (strategy_id included) for every path.
      const result = await (viaUpdateButton ? updateStrategy : saveStrategy)(requestBody);

      // The backend reports failure as HTTP 200 with { status: false, message }.
      // Without this check a rejected save toasted "saved successfully!" and
      // stored a null strategy_id in context — the run-backtest that followed
      // then went out with strategy_name: null.
      // The raw body sits on result.data — the service wraps it in
      // { success, data, strategy_id, ... }, so result.status is always
      // undefined and this check silently passed for every failure.
      if (result?.data?.status === false || result?.status === false) {
        throw new Error(result?.data?.message || result?.message || 'Save failed');
      }

      window.__saveCount = (window.__saveCount || 0) + 1;
      
      const savedStrategyId = result.strategy_id;
      const savedStrategyName = result.strategy_name || strategyName;
      const savedVersion = result.version || result.data?.version || result.data?.strategy?.version || null;

      window.requestAnimationFrame(() => {
      });

      updateStrategyData(savedStrategyId, savedStrategyName, savedVersion);

      // Adopt the id the backend just minted. Without this the app keeps
      // pointing at the ORIGINAL strategy, so the next plain Save would write
      // a new version of the old one instead of the copy just created.
      if (asNew && savedStrategyId) {
        setStrategyId(savedStrategyId);
        setStrategySavedInSession(true);
      }


      // The saved list lives in context, which mirrors it to localStorage — one
      // owner, so a save is visible everywhere at once. The version comes from
      // the response: it is what a later get-strategy has to ask for.
      upsertStrategy({
        id: savedStrategyId,
        name: savedStrategyName,
        version: result.version || contextVersion || 1,
        // The Index dropdown writes to config.dte_filter (it holds the index
        // name, not a DTE, despite the key). config.symbol is a stale default
        // no UI updates, which is why cards used to read SPXW. Both payload
        // builders already send config.dte_filter as `symbol`.
        symbol: config.dte_filter || config.symbol || 'sensex',
        strategy_type: config.strategy_type || 'intraday',
        entry_time: config.entry_time || '09:16',
        exit_time: config.exit_time || '15:40',
        start_date: config.start_date || null,
        end_date: config.end_date || null,
        created_at: new Date().toISOString(),
        leg_count: config.legs?.length || 0,
      });

      // Message follows the endpoint that actually ran.
      const successMessage = viaUpdateButton ? 'Strategy updated successfully' : 'Strategy saved';

      setSaveStatus('success');
      setSaveMessage(successMessage);
      setStrategyId(result.strategy_id);
      

      
      setStrategyConfig(prev => ({
        ...prev,
        strategy_name: strategyName
      }));

      if (!silent) {
        setToastMessage(successMessage);
        setToastType('success');
        setShowToast(true);
      }


      setStrategiesRefreshKey(prev => prev + 1);

      setTimeout(() => setSaveStatus(null), 5000);

      setSaveModalOpen(false);
      
      setStrategySavedInSession(true);

      setSaveCompletedCounter(prev => prev + 1);

      return result;

    } catch (error) {
      logger.error('[App] Save strategy error:', error.message);

      setSaveStatus('error');
      setSaveMessage(error.message || 'Failed to save strategy. Please try again.');
      // saveMessage has no on-screen home of its own — the toast is what the
      // user actually sees.
      setToastMessage(error.message || 'Failed to save strategy. Please try again.');
      setToastType('error');
      setShowToast(true);

      setTimeout(() => setSaveStatus(null), 5000);

      throw error;
    }
  };

  // Memoized handlers to prevent StrategyBuilder re-renders
  const handleSaveStrategyCallback = useCallback(async (configOverride = null, opts = {}) => {
    // Prefer the builder's live config; strategyConfig is a debounced copy that
    // can lag behind the screen (notably right after a strategy loads).
    const configToSave = configOverride || strategyConfig;

    if (strategyId && strategyId !== -999 && strategyId !== '-999' && configToSave.strategy_name) {
      // opts.viaUpdateButton is set ONLY by the Update button. The auto-save
      // that runs before a backtest goes through this same callback and must
      // stay on POST /api/save-strategy.
      return await handleSaveStrategy(configToSave.strategy_name, configToSave, false, opts.viaUpdateButton === true, opts.silent === true);
    } else {
      pendingSaveConfigRef.current = configOverride;
      setSaveModalOpen(true);
      return null;
    }
  }, [strategyId, strategyConfig]);

  // "Save As New": reuse the existing name modal, but tell the save to omit
  // strategy_id so the backend mints a fresh strategy instead of a new version.
  const handleSaveAsNew = useCallback((configOverride = null) => {
    saveAsNewRef.current = true;
    pendingSaveConfigRef.current = configOverride;
    setSaveModalOpen(true);
  }, []);

  // The modal reports the typed name; the refs supply which save it is and the
  // config that was on screen when the button was pressed.
  const handleModalSave = useCallback(async (strategyName) => {
    const asNew = saveAsNewRef.current;
    const configToSave = pendingSaveConfigRef.current;
    saveAsNewRef.current = false;
    pendingSaveConfigRef.current = null;
    return await handleSaveStrategy(strategyName, configToSave, asNew);
  }, [strategyConfig, strategyId]);

  const handleClearResults = useCallback(() => {
    setBacktestResults(null);
  }, []);

  // "Create New Strategy": drop the current strategy's identity and config and
  // land on an empty builder, whose header then reads "Unsaved Strategy".
  // versionLoadCounter is bumped because it keys StrategyBuilder — without it
  // the old form state would survive the remount.
  const handleCreateNewStrategy = useCallback(() => {
    // Starting a fresh strategy also ends any Algo Trade portfolio round trip.
    resetAlgoTab();
    beginStrategyReset();
    clearStrategyData();
    setStrategyImported(false);   // a blank strategy can be imported into again
    // The import hands its config to the builder through this override, which
    // WINS over strategyConfig (see the savedConfig prop). Leaving it set meant
    // "New Strategy" emptied strategyConfig and then remounted the builder onto
    // the imported strategy again — a blank form that was not blank.
    setImportedConfig(null);
    setStrategyId(null);
    setStrategySavedInSession(false);
    setStrategyConfig({});
    setBacktestResults(null);
    setVersionLoadCounter((prev) => prev + 1);
    setActiveTab("builder");
  }, [clearStrategyData, beginStrategyReset]);

  /**
   * "Create Strategies" from the top bar: a blank builder, and a refreshed
   * library behind it.
   *
   * The refresh is why this is not just `handleCreateNewStrategy` -- the
   * sidebar tree is what you reach for straight after creating, and it should
   * show what the BACKEND has rather than whatever this browser cached.
   * Fired and forgotten: the tree listens for the result, and a failed list
   * must never block opening the builder.
   */
  const startNewStrategy = useCallback(() => {
    handleCreateNewStrategy();
    setActiveTab('builder');
    refreshLibrary();
  }, [handleCreateNewStrategy]);

  /**
   * A .algtst import lands here: same reset as "New Strategy", but seeded with
   * the file's config instead of an empty one. No id, no name, nothing saved —
   * the header therefore reads "Unsaved Strategy" and the user is looking at a
   * draft they can edit before committing it. The save is what creates the
   * record, exactly as it would for a strategy typed in by hand.
   */
  const handleImportStrategy = useCallback((imported) => {
    beginStrategyReset();
    clearStrategyData();
    setStrategyId(null);
    setStrategySavedInSession(false);
    setBacktestResults(null);

    // Handed to StrategyBuilder directly rather than through strategyConfig.
    // Routing it through strategyConfig does not survive: the builder flushes
    // its pending config up here when it unmounts, and pushes its own again
    // ~200ms after mounting, so the import was overwritten by whatever empty
    // config was on screen a moment earlier — an import that looked like it
    // worked and left an empty Leg Builder. While this override is set it is
    // what the builder reads; handleConfigChange drops it as soon as the
    // builder pushes the imported strategy back, at which point strategyConfig
    // holds it too.
    setImportedConfig(imported);
    setStrategyImported(true);

    // Remounts StrategyBuilder (it is keyed on this) so the imported config is
    // what the form initialises from rather than being merged into a live one.
    setVersionLoadCounter((prev) => prev + 1);
    setActiveTab('builder');

    setToastMessage('Strategy imported successfully');
    setToastType('success');
    setShowToast(true);
  }, [clearStrategyData]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: colors.page.background }}>
        {/* Toast Notification */}
        {showToast && (
          <Toast
            message={toastMessage}
            type={toastType}
            onClose={() => setShowToast(false)}
          />
        )}

        {/* The one static bar, above the sidebar and every page alike:
            Broker Setup, then the account button. */}
        <TopBar onBrokerSetup={openBrokerSetup}
                onLogout={onLogout}
                onNavigate={navigateFromTopBar}
                onCreateStrategy={startNewStrategy} />

        <div className="app-shell relative flex flex-1 min-h-0">
          {mainSidebarOpen ? (
            /* Open on every page until the user closes it themselves — the
               only exception is the Pro view, which hides it on entry (it has
               a rail of its own) and hands it back on exit. */
            <Sidebar
              className="app-sidebar"
              onOpenStrategy={openStrategyInBuilder}
              onNotify={notify}
              onCreateNewStrategy={handleCreateNewStrategy}
              onToggleSidebar={() => setMainSidebarOpen(false)}
            />
          ) : (
            /* Collapsed rail, identical on every tab: the thin white strip
               with its vertical rule and the » circle — white with a quiet
               ring at rest, theme blue on hover, exactly like its « twin. */
            <div className="w-[30px] shrink-0 bg-white border-r relative" style={{ borderColor: '#ececec' }}>
              <button
                onClick={() => setMainSidebarOpen(true)}
                className="absolute -right-3 top-9 w-7 h-7 rounded-full flex items-center justify-center z-20 text-gray-700 border transition-colors"
        style={{ backgroundColor: '#F5F5F5', borderColor: '#E7E7E7' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0B619B';
                  e.currentTarget.style.color = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#0B619B';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F5F5F5';
                  e.currentTarget.style.color = '';
                  e.currentTarget.style.borderColor = '#E7E7E7';
                }}
                title="Show the menu"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Strategy bar only on the builder (main) page */}
            {activeTab === 'builder' && <Header config={strategyConfig} liveConfigRef={liveConfigRef} strategyId={strategyId} onCreateNewStrategy={handleCreateNewStrategy} onImportStrategy={handleImportStrategy} canImport={!strategyImported && !strategyId} hasResults={Boolean(backtestResults)} onNotify={(message, type = 'success') => { setToastMessage(message); setToastType(type); setShowToast(true); }} />}

            <main className="flex-1 overflow-y-auto px-4 sm:px-5 py-6">
              {activeTab === "builder" && (
                <LazyTab fallback={<TabFallback />}>
                  <StrategyBuilder
                    key={`${strategyId || 'default'}-${versionLoadCounter}-${builderGeneration}`} // Force re-render when strategy or version changes
                    sidebarOpen={mainSidebarOpen}
                    onRunBacktest={handleRunBacktest}
                    isLoading={isLoading}
                    isLoadingStrategy={isLoadingStrategy}
                    liveConfigRef={liveConfigRef}
                    generation={builderGeneration}
                    savedConfig={importedConfig ?? strategyConfig}
                    onConfigChange={handleConfigChange}
                    onSaveStrategy={handleSaveStrategyCallback}
                    onSaveAsNew={handleSaveAsNew}
                    strategyId={strategyId}
                    backtestResults={backtestResults}
                    onClearResults={handleClearResults}
                    strategySavedInSession={strategySavedInSession}
                    saveCompletedCounter={saveCompletedCounter}
                    backtestCompletedCounter={backtestCompletedCounter}
                    onLoadVersion={handleLoadVersion}
                  />
                </LazyTab>
              )}

              {activeTab === "reports" && (
                <LazyTab fallback={<TabFallback />}>
                  <Reports
                    onLoadConfig={handleLoadConfigFromReport}
                    onSwitchToBuilder={() => setActiveTab("builder")}
                  />
                </LazyTab>
              )}

              {activeTab === "portfolios" && (
                <LazyTab fallback={<TabFallback />}>
                  <Portfolios 
                    onCreateNewStrategy={handleCreateNewStrategy}
                    // Same loader the Strategies list uses: it calls
                    // get-strategy, rebuilds the config and switches to the
                    // builder tab, so the portfolio row needs nothing of its own.
                    openPortfolioName={openPortfolioName}
                    onOpenedPortfolio={clearOpenPortfolio}
                    onOpenStrategyInBuilder={handleLoadStrategyFromBackend}
                    onShowToast={(message, type = 'success') => {
                      setToastMessage(message);
                      setToastType(type);
                      setShowToast(true);
                    }}
                  />
                </LazyTab>
              )}

              {activeTab === "algo-trade" && (
                <LazyTab fallback={<TabFallback />}>
                  <AlgoTrade
                    key={`algo-${algoEntry.seq}`}
                    initialView={algoEntry.view}
                    onNotify={notify}
                    onEditPortfolio={goToPortfolios}
                  />
                </LazyTab>
              )}

              {activeTab === "settings" && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-500">
                    <p className="text-xl mb-2">Settings</p>
                    <p>Coming soon...</p>
                  </div>
                </div>
              )}

              {activeTab === "save-strategy" && (
                <LazyTab fallback={<TabFallback />}>
                  <SavedStrategiesList 
                    key={strategiesRefreshKey}
                    refreshKey={strategiesRefreshKey}
                    onLoadStrategy={handleLoadStrategyFromBackend}
                    onNavigateToBuilder={() => setActiveTab("builder")}
                    onShowToast={(message, type) => {
                      setToastMessage(message);
                      setToastType(type);
                      setShowToast(true);
                    }}
                    onRefreshStrategies={() => setStrategiesRefreshKey(prev => prev + 1)}
                  />
                </LazyTab>
              )}
            </main>
          </div>
        </div>

          <SaveStrategyModal
            isOpen={saveModalOpen}
            // Cancelling must clear both refs: the flag, or the next plain Save
            // would silently create a second strategy instead of updating this
            // one; and the parked config, so it cannot leak into a later save
            // (it would also pin that object in memory until then).
            onClose={() => {
              saveAsNewRef.current = false;
              pendingSaveConfigRef.current = null;
              setSaveModalOpen(false);
            }}
            onSave={handleModalSave}
            saveStatus={saveStatus}
            saveMessage={saveMessage}
          />
    </div>
  );
}

export default App;
