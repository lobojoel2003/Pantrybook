interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Install-to-home-screen and app-update handling. */
class Pwa {
	canInstall = $state(false);
	installed = $state(false);
	updateReady = $state(false);
	offlineReady = $state(false);

	private deferred: BeforeInstallPromptEvent | null = null;
	private started = false;

	start(): void {
		if (this.started || typeof window === 'undefined') return;
		this.started = true;
		this.installed = window.matchMedia('(display-mode: standalone)').matches;

		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			this.deferred = event as BeforeInstallPromptEvent;
			this.canInstall = true;
		});
		window.addEventListener('appinstalled', () => {
			this.installed = true;
			this.canInstall = false;
			this.deferred = null;
		});

		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.ready.then(() => {
			this.offlineReady = true;
		});
		void navigator.serviceWorker.getRegistration().then((registration) => {
			if (!registration) return;
			if (registration.waiting && navigator.serviceWorker.controller) this.updateReady = true;
			registration.addEventListener('updatefound', () => {
				const worker = registration.installing;
				worker?.addEventListener('statechange', () => {
					if (worker.state === 'installed' && navigator.serviceWorker.controller) {
						this.updateReady = true;
					}
				});
			});
		});
		// Reload only when a new version replaces an old one, not when the very first
		// service worker takes control of a fresh page.
		let hadController = Boolean(navigator.serviceWorker.controller);
		let reloading = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!hadController) {
				hadController = true;
				return;
			}
			if (reloading) return;
			reloading = true;
			window.location.reload();
		});
	}

	async install(): Promise<void> {
		if (!this.deferred) return;
		await this.deferred.prompt();
		const choice = await this.deferred.userChoice;
		if (choice.outcome === 'accepted') this.canInstall = false;
		this.deferred = null;
	}

	/** Activate the waiting service worker; the page reloads when it takes over. */
	async applyUpdate(): Promise<void> {
		const registration = await navigator.serviceWorker?.getRegistration();
		if (registration?.waiting) {
			registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		} else {
			window.location.reload();
		}
	}
}

export const pwa = new Pwa();
