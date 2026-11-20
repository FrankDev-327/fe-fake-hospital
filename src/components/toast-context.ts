import { createContext, useContext } from 'react';

export const ToastContext = createContext<(text: string) => void>(() => {});

/** const toast = useToast(); toast('Saved') */
export const useToast = () => useContext(ToastContext);
