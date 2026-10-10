import { HubShell } from '@/components/hub/shell';
import { RulesBrowser } from '@/components/hub/rules-browser';
export default function Rules() {
  return (
    <HubShell
      active="Rules"
      title="Know the town."
      subtitle="The rulebook, every script, and every role."
    >
      <section className="panel">
        <RulesBrowser />
      </section>
    </HubShell>
  );
}
