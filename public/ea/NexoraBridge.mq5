//+------------------------------------------------------------------+
//| NexoraBridge.mq5 — NEXORA MT5 execution bridge (v0.1, report-only)|
//| Sends heartbeat, account snapshot and quotes to NEXORA MT5.       |
//| This version NEVER places, modifies or closes orders.             |
//| Your MT5 password is never read or sent.                          |
//+------------------------------------------------------------------+
#property copyright "NEXORA MT5"
#property version   "0.10"
#property strict

input string InpEndpoint = "https://YOUR-APP/api/public/mt5/ingest"; // Ingest address (from Accounts page)
input string InpToken    = "";                                        // Connector token (nxr_...)
input string InpSymbols  = "XAUUSD";                                  // Broker symbols, comma separated (max 50)
input int    InpSeconds  = 5;                                         // Report interval (seconds, 2-60)

#define EA_VERSION "0.1.0"
string g_symbols[];
int    g_fail = 0;

int OnInit()
{
   if(StringLen(InpToken) != 68 || StringFind(InpToken, "nxr_") != 0)
   { Print("NEXORA: token missing or malformed"); return INIT_PARAMETERS_INCORRECT; }
   int n = StringSplit(InpSymbols, ',', g_symbols);
   if(n <= 0 || n > 50) { Print("NEXORA: 1-50 symbols required"); return INIT_PARAMETERS_INCORRECT; }
   for(int i = 0; i < n; i++)
   {
      StringTrimLeft(g_symbols[i]); StringTrimRight(g_symbols[i]);
      SymbolSelect(g_symbols[i], true);
   }
   EventSetTimer(MathMax(2, MathMin(60, InpSeconds)));
   Send();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { Send(); }

string Iso(datetime t)
{
   // MT5 times are broker server time; convert to UTC using the terminal's offset.
   datetime utc = t - (TimeTradeServer() - TimeGMT());
   MqlDateTime d; TimeToStruct(utc, d);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", d.year, d.mon, d.day, d.hour, d.min, d.sec);
}

string Num(double v, int digits) { return DoubleToString(v, digits); }
string Bool(bool b) { return b ? "true" : "false"; }

void Send()
{
   string q = "";
   for(int i = 0; i < ArraySize(g_symbols); i++)
   {
      MqlTick t;
      if(!SymbolInfoTick(g_symbols[i], t) || t.bid <= 0 || t.ask <= 0) continue;
      int digits = (int)SymbolInfoInteger(g_symbols[i], SYMBOL_DIGITS);
      int spread = (int)SymbolInfoInteger(g_symbols[i], SYMBOL_SPREAD);
      if(q != "") q += ",";
      q += StringFormat("{\"symbol\":\"%s\",\"bid\":%s,\"ask\":%s,\"spread\":%d,\"digits\":%d,\"time\":\"%s\"}",
                        g_symbols[i], Num(t.bid, digits), Num(t.ask, digits), spread, digits, Iso(t.time));
   }

   string body = StringFormat(
      "{\"login\":\"%I64d\",\"ea_version\":\"%s\",\"terminal_connected\":%s,\"trade_allowed\":%s,"
      "\"balance\":%s,\"equity\":%s,\"margin_free\":%s,\"server_time\":\"%s\",\"quotes\":[%s]}",
      AccountInfoInteger(ACCOUNT_LOGIN), EA_VERSION,
      Bool(TerminalInfoInteger(TERMINAL_CONNECTED) != 0),
      Bool(TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) != 0 && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0),
      Num(AccountInfoDouble(ACCOUNT_BALANCE), 2), Num(AccountInfoDouble(ACCOUNT_EQUITY), 2),
      Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2), Iso(TimeTradeServer()), q);

   char data[], result[];
   string headers = "Content-Type: application/json\r\nX-Nexora-Token: " + InpToken + "\r\n", resHeaders;
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   ResetLastError();
   int code = WebRequest("POST", InpEndpoint, headers, 5000, data, result, resHeaders);
   if(code == 200) { if(g_fail > 0) Print("NEXORA: reconnected"); g_fail = 0; return; }
   g_fail++;
   if(code == -1) Print("NEXORA: WebRequest failed (", GetLastError(), "). Allow the URL in Tools > Options > Expert Advisors.");
   else Print("NEXORA: server replied ", code, " ", CharArrayToString(result));
   // Report-only bridge: failures never touch positions, SL or TP.
}
