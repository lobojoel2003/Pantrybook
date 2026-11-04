export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
	id: number;
	kind: ToastKind;
	message: string;
	action?: { label: string; run: () => void };
	timeout: number;
}

let counter = 0;

class Toaster {
	items = $state<Toast[]>([]);

	show(
		message: string,
		kind: ToastKind = 'info',
		options: { action?: Toast['action']; timeout?: number } = {}
	): number {
		counter += 1;
		const id = counter;
		const timeout = options.timeout ?? (kind === 'error' || kind === 'warning' ? 8000 : 4500);
		this.items = [...this.items.slice(-3), { id, kind, message, action: options.action, timeout }];
		if (timeout > 0) setTimeout(() => this.dismiss(id), timeout);
		return id;
	}

	dismiss(id: number): void {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toasts = new Toaster();

export const toast = {
	success: (message: string, options?: { action?: Toast['action']; timeout?: number }) =>
		toasts.show(message, 'success', options),
	info: (message: string, options?: { action?: Toast['action']; timeout?: number }) =>
		toasts.show(message, 'info', options),
	warning: (message: string, options?: { action?: Toast['action']; timeout?: number }) =>
		toasts.show(message, 'warning', options),
	error: (message: string, options?: { action?: Toast['action']; timeout?: number }) =>
		toasts.show(message, 'error', options)
};
