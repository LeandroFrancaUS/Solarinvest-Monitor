import { Brand } from '@prisma/client';

export interface PollJobData {
  plantId: string;
  brand: Brand;
}
