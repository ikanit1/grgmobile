import { UserRole } from '../users/entities/user.entity';

export interface RequestUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  complexId?: string;
  email?: string;
  phone?: string;
  name?: string;
}
