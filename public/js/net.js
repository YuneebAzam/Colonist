// WebSocket client. Exposes window.Net.
// The server binds identity to the socket; we keep a secret rejoin token so a reload
// or dropped connection can reclaim the same seat.
(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const Net = {
    ws: null, code: null, playerId: null, host: false, token: null,
    _onState: null, _onError: null, _onChat: null, _onJoined: null, _onStatus: null,
    _retry: 0, _wantRejoin: false,

    saved() {
      const code = store.get('catan.code'), token = store.get('catan.token');
      return code && token ? { code, token } : null;
    },
    forget() { store.del('catan.code'); store.del('catan.token'); store.del('catan.pid'); },

    connect() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${proto}//${location.host}`);
      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'state') {
          this.host = msg.state.hostId === this.playerId;
          if (this._onState) this._onState(msg.state);
        }
        if (msg.type === 'error') {
          if (this._wantRejoin) { this._wantRejoin = false; this.forget(); }
          if (this._onError) this._onError(msg.message);
        }
        if (msg.type === 'chat' && this._onChat) this._onChat(msg);
        if (msg.type === 'joined') {
          this._wantRejoin = false;
          this.code = msg.code; this.playerId = msg.playerId; this.host = msg.host; this.token = msg.token;
          store.set('catan.code', msg.code);
          store.set('catan.token', msg.token);
          store.set('catan.pid', msg.playerId);
          if (this._onJoined) this._onJoined(msg);
        }
        if (msg.type === 'left') { this.code = null; this.playerId = null; this.forget(); }
      };
      this.ws.onclose = () => {
        if (this._onStatus) this._onStatus('offline');
        if (!this.code || !this.token) return;
        // auto-reconnect and reclaim our seat
        const delay = Math.min(10000, 1000 * 2 ** this._retry++);
        setTimeout(() => {
          this.connect().then(() => {
            this._retry = 0;
            this.rejoin(this.code, this.token);
            if (this._onStatus) this._onStatus('online');
          });
        }, delay);
      };
      return new Promise(res => { this.ws.onopen = res; });
    },
    rejoin(code, token) {
      this._wantRejoin = true;
      this.ws.send(JSON.stringify({ type: 'rejoin', code, token }));
    },
    send(type, extra = {}) {
      if (!this.ws || this.ws.readyState !== 1) return;
      this.ws.send(JSON.stringify({ type, code: this.code, ...extra }));
    },
    on(evt, cb) { this['_on' + evt[0].toUpperCase() + evt.slice(1)] = cb; },
  };
  window.Net = Net;
})();
