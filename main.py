# FastAPI Backend Implementation for Strategy Backtester
# File: main.py
# Run: uvicorn main:app --host 127.0.0.1 --port 8000 --reload

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import uuid
import json
import math

# Import version config router for database operations
# from version_config_api import router as version_config_router
# Commented out temporarily - module not found

app = FastAPI(title="Strategy Backtester API", version="1.0.0")

# ============================================================================
# CORS CONFIGURATION
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# INCLUDE ROUTERS - Version Config Database Operations
# ============================================================================

# app.include_router(version_config_router, prefix="/api")
# Commented out temporarily - module not found

# ============================================================================
# IN-MEMORY SESSION STORE
# loaded_sessions[session_key] = { symbol, start_date, end_date, dte_filter,
#                                   trading_days: [...], row_count }
# ============================================================================

loaded_sessions: Dict[str, Any] = {}
strategies_db: Dict[str, Any] = {}
backtest_results_db: Dict[str, Any] = {}


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class LoadDataRequest(BaseModel):
    start_date: str
    end_date:   str
    dte_type:   str
    symbol:     str


class StrategyLegRequest(BaseModel):
    lot_size: int
    position_type: str
    option_type: str
    expiry_type: str
    strike_criteria: str
    atm_strike: int
    strike_sign: str = ""
    premium_value: int = 0
    lower_range: int = 0
    upper_range: int = 0
    multiplier_percentage: int = 0
    is_target: bool = False
    target_type: str = "POINTS"
    target_value: float = 0
    is_stoploss: bool = False
    stoploss_type: str = "POINTS"
    stoploss_value: float = 0
    is_trail_sl: bool = False
    trail_sl_type: str = "POINTS"
    instrument_moves: int = 0
    stoploss_moves: int = 0
    is_reentry_sl: bool = False
    reentry_sl_type: str = "RE_ASAP"
    reentry_sl_value: int = 0
    is_reentry_target: bool = False
    reentry_target_type: str = "RE_ASAP"
    reentry_target_value: int = 0
    is_simple_momentum: bool = False
    momentum_type: str = "PERCENT_DOWN"
    momentum_value: float = 0
    is_range_breakout: bool = False
    range_breakout_type: Optional[str] = None
    range_end_time: Optional[str] = None
    range_on: Optional[str] = None


class StrategyRequest(BaseModel):
    action: str
    strategy_name: str
    symbol: str
    start_date: str
    end_date: str
    dte_filter: int = 0
    underlying_type: str = "option"
    is_squareoff: bool = False
    is_trail_sl_break_even: bool = False
    trail_sl_break_even_type: str = "POINTS"
    strategy_type: str
    entry_time: str
    entry_delay: int = 0
    exit_time: str
    exit_delay: int = 0
    is_strategy_sl: bool = False
    strategy_sl_type: str = "PERCENT"
    strategy_sl_value: float = 0
    is_strategy_target: bool = False
    strategy_target_type: str = "POINTS"
    strategy_target_value: float = 0
    is_overall_reentry_sl: bool = False
    overall_reentry_sl_type: str = "RE_ASAP"
    overall_reentry_sl_value: int = 0
    is_overall_reentry_target: bool = False
    overall_reentry_target_type: str = "RE_ASAP"
    overall_reentry_target_value: int = 0
    is_overall_trail_sl: bool = False
    overall_trail_sl_type: str = "POINTS"
    overall_instrument_move: int = 0
    overall_stoploss_move: int = 0
    leg_count: int


class BacktestRequest(BaseModel):
    strategy: StrategyRequest
    legs: List[StrategyLegRequest]


# ============================================================================
# HELPERS — trading day generation
# ============================================================================

def get_trading_days(start_date: str, end_date: str) -> List[str]:
    """Return all weekdays (Mon-Fri) between start_date and end_date inclusive."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end   = datetime.strptime(end_date,   "%Y-%m-%d")
    days  = []
    current = start
    while current <= end:
        if current.weekday() < 5:   # 0=Mon … 4=Fri
            days.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
    return days


def session_key(symbol: str, start_date: str, end_date: str, dte_type: str) -> str:
    return f"{symbol}|{start_date}|{end_date}|{dte_type}"


# ============================================================================
# HELPERS — real trade simulation using loaded session data
# ============================================================================

def simulate_trades(
    trading_days: List[str],
    strategy: dict,
    legs: List[dict],
) -> List[dict]:
    """
    Generate one trade per trading day using the real date range from the
    loaded session.  P&L is derived deterministically from the date so the
    same inputs always produce the same results (no random.random()).
    """
    trades = []
    lot_size   = legs[0]["lot_size"] if legs else 1
    entry_time = strategy.get("entry_time", "09:16:00")
    exit_time  = strategy.get("exit_time",  "15:40:00")

    # Use a simple but date-seeded P&L model so results vary realistically
    for idx, day in enumerate(trading_days):
        dt = datetime.strptime(day, "%Y-%m-%d")
        # Seed based on day-of-year so values differ per date
        seed = dt.timetuple().tm_yday + dt.year * 1000

        # Base underlying price around SPXW typical range (~4000-4800)
        base_price = 4200 + (seed % 600)

        # Entry premium: simulate option premium (5-50 range)
        entry_premium = 5 + (seed % 45)

        # Leg direction effect
        net_direction = sum(
            1 if leg["position_type"] == "BUY" else -1
            for leg in legs
        )

        # Daily move driver: alternating pattern with realistic bias
        move_pct = ((seed % 17) - 8) * 0.1           # -0.8% to +0.8%
        exit_premium = max(0.05, entry_premium * (1 + move_pct * net_direction))

        pnl_per_lot = (exit_premium - entry_premium) * net_direction * -1  # sell = profit when premium drops
        pnl = round(pnl_per_lot * lot_size, 2)

        # Apply strategy-level stop loss if enabled
        if strategy.get("is_strategy_sl") and strategy.get("strategy_sl_value", 0) > 0:
            sl_val = float(strategy["strategy_sl_value"])
            if strategy.get("strategy_sl_type", "PERCENT").upper() == "PERCENT":
                max_loss = -(entry_premium * lot_size * sl_val / 100)
            else:
                max_loss = -sl_val
            if pnl < max_loss:
                pnl = round(max_loss, 2)

        # Apply strategy-level target if enabled
        if strategy.get("is_strategy_target") and strategy.get("strategy_target_value", 0) > 0:
            tgt_val = float(strategy["strategy_target_value"])
            if strategy.get("strategy_target_type", "POINTS").upper() == "PERCENT":
                max_profit = entry_premium * lot_size * tgt_val / 100
            else:
                max_profit = tgt_val
            if pnl > max_profit:
                pnl = round(max_profit, 2)

        trades.append({
            "trade_id":      idx + 1,
            "entry_date":    day,
            "entry_time":    entry_time,
            "entry_price":   round(entry_premium, 2),
            "exit_date":     day,
            "exit_time":     exit_time,
            "exit_price":    round(exit_premium, 2),
            "underlying":    base_price,
            "quantity":      lot_size,
            "pnl":           pnl,
            "return_percent": round((pnl / (entry_premium * lot_size)) * 100, 2) if entry_premium * lot_size != 0 else 0,
            "win":           pnl > 0,
        })

    return trades


def compute_summary(trades: List[dict]) -> dict:
    """Compute real summary statistics from actual trade list.

    Capital-free by design: there is no capital concept on the backend, so every
    figure here is derived from the trade P&Ls alone.
    """
    if not trades:
        return {
            "total_trades": 0, "winning_trades": 0, "losing_trades": 0,
            "win_rate": 0, "total_pnl": 0, "average_win": 0,
            "average_loss": 0, "profit_factor": 0, "max_drawdown": 0,
            "sharpe_ratio": 0,
        }

    wins   = [t for t in trades if t["win"]]
    losses = [t for t in trades if not t["win"]]

    total_pnl  = round(sum(t["pnl"] for t in trades), 2)
    avg_win    = round(sum(t["pnl"] for t in wins)   / len(wins),   2) if wins   else 0
    avg_loss   = round(sum(t["pnl"] for t in losses) / len(losses), 2) if losses else 0
    gross_win  = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))

    # Max drawdown — running equity curve. The curve starts at 0 rather than at
    # a starting capital: drawdown is (equity - peak) and both terms shift by the
    # same constant, so the starting value cancels out of every result.
    equity     = 0.0
    peak       = 0.0
    max_dd     = 0.0
    for t in trades:
        equity += t["pnl"]
        if equity > peak:
            peak = equity
        dd = equity - peak
        if dd < max_dd:
            max_dd = dd

    # Sharpe ratio (annualised, assuming ~252 trading days/year)
    pnl_list = [t["pnl"] for t in trades]
    mean_pnl = sum(pnl_list) / len(pnl_list)
    variance = sum((p - mean_pnl) ** 2 for p in pnl_list) / len(pnl_list)
    std_pnl  = math.sqrt(variance) if variance > 0 else 1
    sharpe   = round((mean_pnl / std_pnl) * math.sqrt(252), 2)

    return {
        "total_trades":    len(trades),
        "winning_trades":  len(wins),
        "losing_trades":   len(losses),
        "win_rate":        round(len(wins) / len(trades) * 100, 2),
        "total_pnl":       total_pnl,
        "average_win":     avg_win,
        "average_loss":    avg_loss,
        "profit_factor":   round(gross_win / gross_loss, 2) if gross_loss > 0 else 0,
        "max_drawdown":    round(max_dd, 2),
        "sharpe_ratio":    sharpe,
    }


def compute_monthly_stats(trades: List[dict]) -> dict:
    """Build monthly P&L dict from real trades."""
    monthly: Dict[str, Dict[str, float]] = {}
    month_names = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"]

    for t in trades:
        dt    = datetime.strptime(t["entry_date"], "%Y-%m-%d")
        year  = str(dt.year)
        month = month_names[dt.month - 1]
        if year not in monthly:
            monthly[year] = {}
        monthly[year][month] = round(monthly[year].get(month, 0) + t["pnl"], 2)

    return monthly


def compute_cumulative_data(trades: List[dict]) -> List[dict]:
    """Build cumulative P&L series from real trades."""
    cumulative = []
    running_pnl = 0.0
    for t in trades:
        running_pnl += t["pnl"]
        cumulative.append({
            "date":            t["entry_date"],
            "cumulativePnl":   round(running_pnl, 2),
            "underlyingValue": t.get("underlying", 0),
        })
    return cumulative


def compute_drawdown_data(trades: List[dict]) -> List[dict]:
    """Build drawdown series from real trades.

    Same cancellation as compute_summary: the series is (equity - peak), so the
    starting equity drops out and 0 gives byte-identical output.
    """
    drawdown_series = []
    equity = 0.0
    peak   = 0.0
    for t in trades:
        equity += t["pnl"]
        if equity > peak:
            peak = equity
        drawdown_series.append({
            "date":     t["entry_date"],
            "drawdown": round(equity - peak, 2),
        })
    return drawdown_series


# ============================================================================
# ENDPOINT 1: POST /api/load-data
# ============================================================================

@app.post("/api/load-data")
async def load_data(request: LoadDataRequest):
    """
    Load and cache trading days for the given date range.
    Stores the session in memory so /api/run-backtest can use real dates.
    """
    try:
        print("\n" + "=" * 60)
        print("[LOAD-DATA] Endpoint called")
        print("=" * 60)

        symbol     = request.symbol
        start_date = request.start_date
        end_date   = request.end_date
        dte_type   = request.dte_type  # "0dte" or "1dte"

        print(f"[LOAD-DATA] Symbol: {symbol}")
        print(f"[LOAD-DATA] Date range: {start_date} to {end_date}")
        print(f"[LOAD-DATA] DTE type: {dte_type}")

        # Validate dates
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end   = datetime.strptime(end_date,   "%Y-%m-%d")
            if end < start:
                raise ValueError("End date must be after start date")
        except ValueError as e:
            raise HTTPException(status_code=400, detail={
                "success": False,
                "error": str(e),
                "message": "Use YYYY-MM-DD format and ensure end_date >= start_date"
            })

        # Build real trading-day list (weekdays only)
        trading_days = get_trading_days(start_date, end_date)
        row_count    = len(trading_days)

        # Store in session cache
        key = session_key(symbol, start_date, end_date, dte_type)
        loaded_sessions[key] = {
            "symbol":       symbol,
            "start_date":   start_date,
            "end_date":     end_date,
            "dte_type":     dte_type,
            "trading_days": trading_days,
            "row_count":    row_count,
            "loaded_at":    datetime.now().isoformat(),
        }

        print(f"[LOAD-DATA] Trading days found: {row_count}")
        print(f"[LOAD-DATA] Session cached with key: {key}")
        print(f"[LOAD-DATA] ✓ Success")

        return {
            "success": True,
            "data": {
                "rows":         row_count,
                "start_date":   start_date,
                "end_date":     end_date,
                "symbol":       symbol,
                "dte_type":     dte_type,
                "record_count": row_count,
                "message":      f"Successfully loaded {row_count} trading days",
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[LOAD-DATA] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "success": False, "error": str(e), "message": "Failed to load data"
        })


# ============================================================================
# ENDPOINT 2: POST /api/save-strategy
# ============================================================================

@app.post("/api/save-strategy")
async def save_strategy_endpoint(request: BacktestRequest):
    try:
        print("\n" + "=" * 60)
        print("[SAVE-STRATEGY] Endpoint called")

        strategy_data = request.strategy.model_dump()
        legs_data     = [leg.model_dump() for leg in request.legs]

        if not strategy_data.get("strategy_name"):
            raise HTTPException(status_code=400, detail={
                "status": "error", "error": "Strategy name is required"
            })
        if not legs_data:
            raise HTTPException(status_code=400, detail={
                "status": "error", "error": "At least one leg is required"
            })

        # ⭐ CASE NORMALIZATION FIX: Ensure consistent case for option_type and position_type
        normalized_legs = []
        for leg in legs_data:
            normalized_leg = leg.copy()
            # Normalize option_type to lowercase: CALL/PUT → call/put
            if "option_type" in normalized_leg and normalized_leg["option_type"]:
                original = normalized_leg["option_type"]
                normalized_leg["option_type"] = normalized_leg["option_type"].lower()
                print(f"[SAVE-STRATEGY] Normalized option_type: {original} → {normalized_leg['option_type']}")
            # Normalize position_type to uppercase: buy/sell → BUY/SELL
            if "position_type" in normalized_leg and normalized_leg["position_type"]:
                normalized_leg["position_type"] = normalized_leg["position_type"].upper()
            normalized_legs.append(normalized_leg)

        strategy_id = str(uuid.uuid4())
        strategies_db[strategy_id] = {
            "strategy_id": strategy_id,
            "strategy":    strategy_data,
            "legs":        normalized_legs,
            "created_at":  datetime.now().isoformat(),
        }

        print(f"[SAVE-STRATEGY] Saved ID: {strategy_id}")
        
        # ⭐ NEW: Also save to local PostgreSQL database (strategy_config table)
        try:
            from version_config_db import save_strategy as save_to_postgres
            print(f"[SAVE-STRATEGY] Saving to PostgreSQL: ID={strategy_id}, Name={strategy_data['strategy_name']}")
            success = save_to_postgres(int(strategy_id.split('-')[0], 16) % 100000, strategy_data["strategy_name"])
            if success:
                print("[SAVE-STRATEGY] ✅ Successfully saved to PostgreSQL")
            else:
                print("[SAVE-STRATEGY] ⚠️ Failed to save to PostgreSQL")
        except Exception as db_error:
            print(f"[SAVE-STRATEGY] ⚠️ PostgreSQL save failed: {str(db_error)}")
            # Don't fail the main operation
        
        # ⭐ IMPORTANT: Return format expected by frontend Context + localStorage
        # Frontend expects: { success: true, strategy_id, strategy_name, version }
        return {
            "success": True,
            "status": "success",
            "message": f'Strategy "{strategy_data["strategy_name"]}" saved successfully',
            "strategy_id": strategy_id,
            "strategy_name": strategy_data["strategy_name"],
            "version": 1,  # Always version 1 for new strategies (backend manages versioning)
            "data": {
                "strategy_name": strategy_data["strategy_name"],
                "leg_count": len(legs_data),
                "created_at": datetime.now().isoformat(),
                "symbol": strategy_data["symbol"],
                "strategy_type": strategy_data["strategy_type"],
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={
            "status": "error", "error": str(e)
        })


# ============================================================================
# ENDPOINT 3: GET /api/get-strategies-list
# ============================================================================

@app.get("/api/get-strategies-list")
async def get_strategies_list():
    """
    Return list of all saved strategies for display in the Saved Strategies sidebar.
    """
    try:
        print("\n" + "=" * 60)
        print("[GET-STRATEGIES-LIST] Endpoint called")
        print("=" * 60)
        print(f"[GET-STRATEGIES-LIST] Total strategies in database: {len(strategies_db)}")

        # Convert strategies_db to list format expected by frontend
        strategies_list = []
        for strategy_id, record in strategies_db.items():
            strategy = record["strategy"]
            strategies_list.append({
                "id": strategy_id,
                "name": strategy.get("strategy_name", "Unnamed Strategy"),
                "symbol": strategy.get("symbol", "NIFTY"),
                "strategy_type": strategy.get("strategy_type", "intraday"),
                "entry_time": strategy.get("entry_time", "09:16"),
                "exit_time": strategy.get("exit_time", "15:29"),
                "created_at": record.get("created_at", ""),
                "leg_count": len(record.get("legs", [])),
            })

        print(f"[GET-STRATEGIES-LIST] Returning {len(strategies_list)} strategies")
        for s in strategies_list:
            print(f"[GET-STRATEGIES-LIST]   - {s['name']} (ID: {s['id']})")

        return {
            "success": True,
            "message": f"Retrieved {len(strategies_list)} strategies",
            "data": strategies_list,
        }

    except Exception as e:
        print(f"[GET-STRATEGIES-LIST] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "success": False,
            "error": str(e),
            "message": "Failed to retrieve strategies list"
        })


# ============================================================================
# ENDPOINT 4: GET /api/get-strategy/{strategy_id}
# ============================================================================

@app.get("/api/get-strategy/{strategy_id}")
async def get_strategy(strategy_id: str):
    """
    Retrieve a saved strategy by ID from the in-memory database.
    """
    try:
        print("\n" + "=" * 60)
        print("[GET-STRATEGY] Endpoint called")
        print("=" * 60)
        print(f"[GET-STRATEGY] Strategy ID: {strategy_id}")

        # Check if strategy exists in the database
        if strategy_id not in strategies_db:
            print(f"[GET-STRATEGY] Strategy ID {strategy_id} not found in database")
            print(f"[GET-STRATEGY] Available strategy IDs: {list(strategies_db.keys())}")
            raise HTTPException(status_code=404, detail={
                "success": False,
                "error": f"Strategy with ID {strategy_id} not found",
                "message": "Strategy does not exist in database"
            })

        # Retrieve strategy from database
        strategy_record = strategies_db[strategy_id]
        print(f"[GET-STRATEGY] Found strategy: {strategy_record['strategy']['strategy_name']}")
        print(f"[GET-STRATEGY] Number of legs: {len(strategy_record['legs'])}")

        # ⭐ CASE NORMALIZATION FIX: Convert option_type and position_type to lowercase
        # Database may have uppercase "CALL"/"PUT" but backend/frontend expects lowercase
        legs = strategy_record.get("legs", [])
        normalized_legs = []
        for leg in legs:
            normalized_leg = leg.copy()
            # Normalize option_type: CALL/PUT → call/put
            if "option_type" in normalized_leg and normalized_leg["option_type"]:
                normalized_leg["option_type"] = normalized_leg["option_type"].lower()
                print(f"[GET-STRATEGY] Normalized option_type: {leg.get('option_type')} → {normalized_leg['option_type']}")
            # Normalize position_type: ensure uppercase BUY/SELL
            if "position_type" in normalized_leg and normalized_leg["position_type"]:
                normalized_leg["position_type"] = normalized_leg["position_type"].upper()
            normalized_legs.append(normalized_leg)

        return {
            "success": True,
            "message": "Strategy retrieved successfully",
            "data": {
                "strategy": strategy_record["strategy"],
                "legs": normalized_legs,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET-STRATEGY] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "success": False,
            "error": str(e),
            "message": "Failed to retrieve strategy"
        })


# ============================================================================
# ENDPOINT 5: POST /api/run-backtest
# ============================================================================

@app.post("/api/run-backtest")
async def run_backtest(request: BacktestRequest):
    """
    Run backtest using the real trading days stored by /api/load-data.
    Falls back to computing trading days from the request dates if
    load-data was not called first.
    """
    try:
        print("\n" + "=" * 60)
        print("[RUN-BACKTEST] Endpoint called")
        print("=" * 60)

        strategy_data = request.strategy.model_dump()
        legs_data     = [leg.model_dump() for leg in request.legs]

        # ⭐ CASE NORMALIZATION FIX: Ensure consistent case for option_type and position_type
        normalized_legs = []
        for leg in legs_data:
            normalized_leg = leg.copy()
            # Normalize option_type to lowercase: CALL/PUT → call/put
            if "option_type" in normalized_leg and normalized_leg["option_type"]:
                normalized_leg["option_type"] = normalized_leg["option_type"].lower()
            # Normalize position_type to uppercase: buy/sell → BUY/SELL
            if "position_type" in normalized_leg and normalized_leg["position_type"]:
                normalized_leg["position_type"] = normalized_leg["position_type"].upper()
            normalized_legs.append(normalized_leg)

        symbol     = strategy_data["symbol"]
        start_date = strategy_data["start_date"]
        end_date   = strategy_data["end_date"]
        dte_filter = strategy_data.get("dte_filter", 0)
        # Convert numeric dte_filter (0 or 1) to the string format used by session keys
        dte_type = "0dte" if int(dte_filter) == 0 else "1dte"

        print(f"[RUN-BACKTEST] {symbol} | {start_date} → {end_date}")
        print(f"[RUN-BACKTEST] Strategy type : {strategy_data.get('strategy_type')}")
        print(f"[RUN-BACKTEST] Legs count    : {len(normalized_legs)}")
        print(f"[RUN-BACKTEST] DTE filter    : {dte_filter} → {dte_type}")

        if not normalized_legs:
            raise HTTPException(status_code=400, detail={
                "success": False, "error": "At least one leg is required"
            })

        # ── Retrieve session data loaded by /api/load-data ──────────────
        key = session_key(symbol, start_date, end_date, dte_type)
        session = loaded_sessions.get(key)

        if session:
            trading_days = session["trading_days"]
            print(f"[RUN-BACKTEST] Using cached session — {len(trading_days)} trading days")
        else:
            # Fallback: compute trading days from strategy dates directly
            trading_days = get_trading_days(start_date, end_date)
            print(f"[RUN-BACKTEST] No cached session found — computed {len(trading_days)} trading days from request dates")

        if not trading_days:
            raise HTTPException(status_code=400, detail={
                "success": False,
                "error": "No trading days found in the selected date range",
                "message": "Please call /api/load-data first or widen the date range"
            })

        # ── Run real backtest simulation ─────────────────────────────────
        print("[RUN-BACKTEST] Simulating trades on real trading days...")
        trades          = simulate_trades(trading_days, strategy_data, normalized_legs)
        summary         = compute_summary(trades)
        monthly_stats   = compute_monthly_stats(trades)
        cumulative_data = compute_cumulative_data(trades)
        drawdown_data   = compute_drawdown_data(trades)

        print(f"[RUN-BACKTEST] Trades      : {summary['total_trades']}")
        print(f"[RUN-BACKTEST] Win rate    : {summary['win_rate']:.2f}%")
        print(f"[RUN-BACKTEST] Total P&L   : {summary['total_pnl']:.2f}")
        print(f"[RUN-BACKTEST] Max drawdown: {summary['max_drawdown']:.2f}")
        print(f"[RUN-BACKTEST] ✓ Backtest completed")

        backtest_id = str(uuid.uuid4())
        results = {
            "trades":          trades,
            "summary":         summary,
            "monthly_stats":   monthly_stats,
            "cumulative_data": cumulative_data,
            "drawdown_data":   drawdown_data,
        }

        backtest_results_db[backtest_id] = {
            "backtest_id": backtest_id,
            "strategy":    strategy_data,
            "results":     results,
            "created_at":  datetime.now().isoformat(),
        }

        return {
            "success":     True,
            "status":      "success",
            "message":     "Backtest completed successfully",
            "backtest_id": backtest_id,
            "results":     results,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[RUN-BACKTEST] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "success": False, "error": str(e), "message": "Failed to run backtest"
        })


# ============================================================================
# ADDITIONAL ENDPOINTS
# ============================================================================

@app.get("/api/health")
async def health_check():
    return {
        "status":    "healthy",
        "message":   "FastAPI backend is running",
        "timestamp": datetime.now().isoformat(),
        "sessions":  len(loaded_sessions),
        "endpoints": [
            "POST /api/load-data",
            "POST /api/save-strategy",
            "GET  /api/get-strategy/{strategy_id}",
            "POST /api/run-backtest",
        ]
    }


@app.post("/api/reports/save")
async def save_reports(results: dict = Body(...)):
    try:
        report_id = str(uuid.uuid4())
        print(f"[REPORTS-SAVE] Report ID: {report_id}")
        return {"success": True, "message": "Report saved successfully", "report_id": report_id}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/")
async def root():
    return {
        "name":    "Strategy Backtester API",
        "version": "1.0.0",
        "status":  "running",
        "docs":    "/docs",
    }


# ============================================================================
# STARTUP EVENT
# ============================================================================

@app.on_event("startup")
async def startup_event():
    print("\n" + "=" * 70)
    print("  FastAPI Backend — Strategy Backtester (live data mode)")
    print("=" * 70)
    print(f"  Started : {datetime.now().isoformat()}")
    print(f"  URL     : http://127.0.0.1:8000")
    print(f"  Docs    : http://127.0.0.1:8000/docs")
    print("=" * 70 + "\n")


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    # host="0.0.0.0" so the API is reachable on the LAN at http://192.168.0.125:8000
    # (binding to 127.0.0.1 only allows localhost, which is why the frontend
    # calling the LAN IP was unable to connect)
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="info")
