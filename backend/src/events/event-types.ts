/**
 * Event type constants for event_logs and device events.
 */

// Device / door events
export const EVENT_TYPE_INCOMING_CALL = 'incoming_call';
export const EVENT_TYPE_DOOR_OPEN = 'door_open';
export const EVENT_TYPE_MISSED_CALL = 'missed_call';

// Akuvox webhook events (from panel)
export const EVENT_TYPE_AKUVOX_DOOR_OPEN = 'akuvox_door_open';
export const EVENT_TYPE_AKUVOX_INCOMING_CALL = 'akuvox_incoming_call';
export const EVENT_TYPE_AKUVOX_CALL_FINISHED = 'akuvox_call_finished';
export const EVENT_TYPE_DEVICE_CONFIG_SYNCED = 'device_config_synced';

// Authentication
export const EVENT_TYPE_USER_LOGIN = 'user_login';
export const EVENT_TYPE_USER_REGISTERED = 'user_registered';

// User management
export const EVENT_TYPE_USER_CREATED = 'user_created';
export const EVENT_TYPE_USER_BLOCKED = 'user_blocked';
export const EVENT_TYPE_USER_UNBLOCKED = 'user_unblocked';
export const EVENT_TYPE_USER_DELETED = 'user_deleted';

// Admin impersonation
export const EVENT_TYPE_ADMIN_IMPERSONATE = 'admin_impersonate';

// Devices CRUD
export const EVENT_TYPE_DEVICE_ADDED = 'device_added';
export const EVENT_TYPE_DEVICE_UPDATED = 'device_updated';
export const EVENT_TYPE_DEVICE_DELETED = 'device_deleted';

// Apartment applications
export const EVENT_TYPE_APPLICATION_SUBMITTED = 'application_submitted';
export const EVENT_TYPE_APPLICATION_DECIDED = 'application_decided';

// Residents
export const EVENT_TYPE_RESIDENT_ADDED = 'resident_added';
export const EVENT_TYPE_RESIDENT_REMOVED = 'resident_removed';

// Organisations
export const EVENT_TYPE_ORG_CREATED = 'org_created';
export const EVENT_TYPE_ORG_UPDATED = 'org_updated';
export const EVENT_TYPE_ORG_DELETED = 'org_deleted';

// Buildings
export const EVENT_TYPE_BUILDING_CREATED = 'building_created';
export const EVENT_TYPE_BUILDING_DELETED = 'building_deleted';
