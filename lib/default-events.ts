export interface SpottEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string;
  price: number;
  status: string;
  organizer: string;
  verified: boolean;
  location: string;
  address?: string;
  city: string;
  latitude?: number;
  longitude?: number;
  categories: string[];
  registrations: number;
  confirmedAt: string | null;
  isSaved?: boolean;
}

// Clean slate: Zero dummy / placeholder events
export const DEFAULT_EVENTS: SpottEvent[] = [];
