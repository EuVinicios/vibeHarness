import type { ActionId } from '../core/stage.js';
import { initCommand } from './init.js';
import { prdCommand } from './prd.js';
import { planCommand } from './plan.js';
import { packCommand } from './pack.js';
import { auditCommand } from './audit.js';
import { doctorCommand } from './doctor.js';

/**
 * In-process lifecycle dispatcher (pretty CLI path) — used by the deprecated
 * guided `start` flow. The guided flow must never be killed by the audit
 * gates (score or zero-criticals), so audit runs with failUnder 0 and the
 * criticals escape hatch — the report still surfaces every finding.
 */
export async function runLifecycleCommand(id: ActionId): Promise<void> {
  switch (id) {
    case 'init':
      await initCommand({ yes: true });
      break;
    case 'prd':
      await prdCommand({ yes: true });
      break;
    case 'plan':
      await planCommand({ yes: true, apply: true });
      break;
    case 'pack':
      await packCommand({});
      break;
    case 'audit':
      await auditCommand({ report: true, failUnder: '0', allowCritical: true, yes: true });
      break;
    case 'doctor':
      await doctorCommand({ fix: true });
      break;
  }
}
