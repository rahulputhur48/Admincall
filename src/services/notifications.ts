// Web Audio synthesizer for alert tones without external audio file dependencies

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private continuousInterval: ReturnType<typeof setInterval> | null = null;
  private isContinuousAlarmRunning: boolean = false;
  private continuousAlarmVariant: 'ADMIN' | 'LINE' = 'ADMIN';

  constructor() {
    // Lazy audio context unlock on user gestures
    if (typeof window !== 'undefined') {
      const unlock = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('click', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('touchstart', unlock);
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    if (!enabled) {
      // If muted, audio output stops
    } else if (this.isContinuousAlarmRunning) {
      // If continuous alarm was active, resume pulsing immediately
      this.playCurrentContinuousPulse();
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public isAlarmRinging(): boolean {
    return this.isContinuousAlarmRunning && this.soundEnabled;
  }

  /**
   * Start sounding the alarm continuously in a loop until stopped
   */
  public startContinuousAlarm(variant: 'ADMIN' | 'LINE' = 'ADMIN') {
    this.isContinuousAlarmRunning = true;
    this.continuousAlarmVariant = variant;

    // If interval is already active for this variant, keep running
    if (this.continuousInterval) {
      return;
    }

    // Play immediate pulse
    this.playCurrentContinuousPulse();

    // Loop continuously every 1250ms (0.85s pulses + 0.4s pause)
    this.continuousInterval = setInterval(() => {
      if (this.soundEnabled && this.isContinuousAlarmRunning) {
        this.playCurrentContinuousPulse();
      }
    }, 1250);
  }

  /**
   * Stop continuous alarm sounding
   */
  public stopContinuousAlarm() {
    this.isContinuousAlarmRunning = false;
    if (this.continuousInterval) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }
  }

  private playCurrentContinuousPulse() {
    if (!this.soundEnabled) return;
    if (this.continuousAlarmVariant === 'ADMIN') {
      this.playPlantAdminAlarm();
    } else {
      this.playLineWarningAlarm();
    }
  }

  /**
   * Loud industrial buzzer / alarm for Admin when a workstation calls (single burst of 3 pulses)
   */
  public playPlantAdminAlarm() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      // 3 urgent buzzer pulses: alternating 950Hz and 750Hz
      for (let i = 0; i < 3; i++) {
        const offset = now + i * 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(950, offset);
        osc.frequency.setValueAtTime(750, offset + 0.12);

        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.35, offset + 0.02);
        gain.gain.setValueAtTime(0.35, offset + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.26);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.27);
      }
    } catch (e) {
      console.warn('Audio alarm error:', e);
    }
  }

  /**
   * Urgent station warning alert for Line operator while waiting for Admin
   */
  public playLineWarningAlarm() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      // 3 urgent station pulses: 880Hz -> 660Hz
      for (let i = 0; i < 3; i++) {
        const offset = now + i * 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, offset);
        osc.frequency.setValueAtTime(660, offset + 0.12);

        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.3, offset + 0.02);
        gain.gain.setValueAtTime(0.3, offset + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.26);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.27);
      }
    } catch (e) {
      console.warn('Line audio alarm error:', e);
    }
  }

  /**
   * Positive chime when Admin acknowledges: informs the workstation operator
   */
  public playAckChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      // High bright two-tone: E5 (659Hz) -> A5 (880Hz)
      const freqs = [659.25, 880.0];
      freqs.forEach((freq, idx) => {
        const offset = now + idx * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, offset);

        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.28, offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.38);
      });
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  /**
   * Resolution chime: C5 -> E5 -> G5 -> C6
   */
  public playResolvedChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const offset = now + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, offset);
        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.2, offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.35);
      });
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  /**
   * Factory PA announcement chime: F4 -> A4 -> C5
   */
  public playAnnouncementChime() {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const notes = [349.23, 440.0, 523.25];
      notes.forEach((freq, idx) => {
        const offset = now + idx * 0.16;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, offset);

        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.28, offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.42);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.45);
      });
    } catch (e) {
      console.warn('Audio announcement chime error:', e);
    }
  }

  /**
   * Play an urgent emergency siren/two-tone alarm (legacy/fallback)
   */
  public playEmergencyAlarm(urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'ALL_CLEAR' = 'CRITICAL') {
    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;

      if (urgency === 'ALL_CLEAR') {
        this.playResolvedChime();
        return;
      }

      const repetitions = urgency === 'CRITICAL' ? 3 : 2;
      for (let i = 0; i < repetitions; i++) {
        const offset = now + i * 0.35;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = urgency === 'CRITICAL' ? 'sawtooth' : 'triangle';
        const startFreq = urgency === 'CRITICAL' ? 880 : 660;
        const endFreq = urgency === 'CRITICAL' ? 587.33 : 440;

        osc.frequency.setValueAtTime(startFreq, offset);
        osc.frequency.setValueAtTime(endFreq, offset + 0.15);

        gain.gain.setValueAtTime(0, offset);
        gain.gain.linearRampToValueAtTime(0.25, offset + 0.02);
        gain.gain.setValueAtTime(0.25, offset + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, offset + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(offset);
        osc.stop(offset + 0.34);
      }
    } catch (e) {
      console.warn('Could not play audio tone:', e);
    }
  }

  private titleBlinkInterval: ReturnType<typeof setInterval> | null = null;
  private defaultDocTitle: string = typeof document !== 'undefined' ? document.title : 'PlantAlert - Production Help System';

  /**
   * Check if running inside an iframe (e.g. preview container)
   */
  public isInIframe(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }

  /**
   * Check if browser Notification API is available
   */
  public isNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Blink browser tab title during an active emergency or broadcast
   */
  public startTitleAlert(alertText: string) {
    if (typeof document === 'undefined') return;
    this.stopTitleAlert();
    if (!this.defaultDocTitle) {
      this.defaultDocTitle = document.title || 'PlantAlert - Production Help System';
    }
    let toggle = false;
    this.titleBlinkInterval = setInterval(() => {
      document.title = toggle ? alertText : `🔔 ${this.defaultDocTitle}`;
      toggle = !toggle;
    }, 1000);
  }

  /**
   * Stop blinking browser tab title and restore normal title
   */
  public stopTitleAlert() {
    if (this.titleBlinkInterval) {
      clearInterval(this.titleBlinkInterval);
      this.titleBlinkInterval = null;
    }
    if (typeof document !== 'undefined' && this.defaultDocTitle) {
      document.title = this.defaultDocTitle;
    }
  }

  /**
   * Request browser notifications permission with dual promise/callback support
   * and graceful handling for iframes and browser restrictions.
   */
  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!this.isNotificationSupported()) {
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }

    try {
      let resultPermission: NotificationPermission | undefined;
      // Handle both Promise-based (modern) and callback-based (legacy/Safari) implementations
      const promise = Notification.requestPermission((p) => {
        resultPermission = p;
      });

      if (promise && typeof promise.then === 'function') {
        const res = await promise;
        return res || Notification.permission;
      }
      return resultPermission || Notification.permission;
    } catch (err) {
      console.warn('Error requesting notification permission (may be restricted by iframe/browser):', err);
      return Notification.permission || 'denied';
    }
  }

  public getNotificationPermission(): NotificationPermission {
    if (!this.isNotificationSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Trigger a desktop/system notification
   */
  public showSystemNotification(title: string, options?: NotificationOptions): Notification | null {
    if (!this.isNotificationSupported() || Notification.permission !== 'granted') {
      return null;
    }
    try {
      const n = new Notification(title, {
        badge: '/favicon.ico',
        icon: '/favicon.ico',
        requireInteraction: true,
        ...options,
      });

      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore
        }
        n.close();
      };

      return n;
    } catch (err) {
      console.warn('Unable to show system notification:', err);
      return null;
    }
  }
}

export const notificationService = new NotificationService();
