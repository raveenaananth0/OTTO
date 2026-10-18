import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import s from "./OttoPage.module.css";
export function OttoConfirm({
  title,
  children,
  busy,
  onClose,
  onConfirm,
  label = "Confirm",
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.modal}
      aria-labelledby="otto-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="otto-confirm-title">{title}</h2>
      {children}
      <div className={s.actions}>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Go back
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : label}
        </Button>
      </div>
    </dialog>
  );
}
