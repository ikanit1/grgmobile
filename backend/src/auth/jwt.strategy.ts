import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

interface JwtPayload {
  sub: string;
  role?: string;
  organization_id?: string;
  complex_id?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    return {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      complexId: user.complexId ?? undefined,
      email: user.email,
      phone: user.phone,
      name: user.name,
    };
  }
}
