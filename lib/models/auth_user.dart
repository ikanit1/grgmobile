class AuthUser {
  final String id;
  final String? name;
  final String role;
  final String? organizationId;
  final String? complexId;

  const AuthUser({
    required this.id,
    this.name,
    required this.role,
    this.organizationId,
    this.complexId,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        name: json['name'] as String?,
        role: json['role'] as String? ?? 'RESIDENT',
        organizationId: json['organizationId'] as String?,
        complexId: json['complexId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'role': role,
        'organizationId': organizationId,
        'complexId': complexId,
      };
}
