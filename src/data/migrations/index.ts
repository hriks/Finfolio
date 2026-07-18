import { up_001_initial } from './001-initial';
import { up_002_location } from './002-location';
import { up_003_subcategory } from './003-subcategory';
import { up_004_merge_patterns } from './004-merge-patterns';
import { up_005_drop_budgets } from './005-drop-budgets';
import { up_006_ingestion_body } from './006-ingestion-body';

export interface Migration {
  version: number;
  up: string;
}

export const migrations: Migration[] = [
  { version: 1, up: up_001_initial },
  { version: 2, up: up_002_location },
  { version: 3, up: up_003_subcategory },
  { version: 4, up: up_004_merge_patterns },
  { version: 5, up: up_005_drop_budgets },
  { version: 6, up: up_006_ingestion_body },
];
