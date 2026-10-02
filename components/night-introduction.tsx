'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function NightIntroduction({
  information,
}: {
  information: { id: string; text: string };
}) {
  const [open, setOpen] = useState(true);
  const [read, setRead] = useState(false);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setOpen(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  return (
    <section className="panel night-choice-panel">
      <p className="eyebrow">NIGHT 1 · PRIVATE INFORMATION</p>
      <h2>Your first-night task</h2>
      <p>
        {read
          ? 'Information reviewed. You can read it again here or in Messages.'
          : 'The Storyteller sent your team introduction. Read it privately.'}
      </p>
      <button className="primary" onClick={() => setOpen(true)}>
        {read ? 'Review team introduction' : 'Read team introduction'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>Your team introduction</DialogTitle>
            <DialogDescription>
              Private information from your Storyteller. Keep this screen to
              yourself.
            </DialogDescription>
          </DialogHeader>
          <p className="night-team-information">{information.text}</p>
          <button
            className="primary"
            onClick={() => {
              setRead(true);
              setOpen(false);
            }}
          >
            I understand
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
