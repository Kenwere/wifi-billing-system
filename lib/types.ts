export type Role = "super_admin" | "admin" | "operator" | "support";

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  paymentStatus: "trial" | "paid" | "overdue";
  paymentExpiresAt: string;
  trialEndsAt: string;
  createdAt: string;
}

export interface RouterConfig {
  id: string;
  name: string;
  location: string;
  host: string;
  apiPort: number;
  username: string;
  password: string;
  paymentDestination: PaymentDestination;
  setupOptions: {
    disableHotspotSharing: boolean;
    enableDeviceTracking: boolean;
    enableBandwidthControl: boolean;
    enableSessionLogging: boolean;
  };
  active: boolean;
  createdAt: string;
}

export interface WifiPackage {
  id: string;
  routerId: string | "global";
  name: string;
  priceKsh: number;
  durationMinutes: number;
  speedLimitKbps?: number;
  dataLimitMb?: number;
  validityHours: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod =
  | "mpesa_till"
  | "mpesa_paybill"
  | "mpesa_phone"
  | "paystack"
  | "other";

export interface PaymentDestination {
  enabledMethods: PaymentMethod[];
  mpesaTill?: string;
  mpesaPaybill?: string;
  mpesaPhone?: string;
  paystackPublicKey?: string;
  paystackSecretKey?: string;
  otherGatewayLabel?: string;
}

export interface HotspotUser {
  id: string;
  phone: string;
  macAddress: string;
  lastIp: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  routerId: string;
  packageId: string;
  phone: string;
  macAddress: string;
  ipAddress: string;
  loginTime: string;
  logoutTime?: string;
  expiresAt: string;
  durationUsedMinutes: number;
  status: "active" | "expired" | "disconnected";
  bytesIn: number;
  bytesOut: number;
  manualTerminationReason?: string;
}

export interface PaymentLog {
  id: string;
  userPhone: string;
  packageId: string;
  packageName: string;
  amountKsh: number;
  method: PaymentMethod;
  date: string;
  time: string;
  routerId: string;
  status: "pending" | "active" | "failed";
  sessionId?: string;
  sessionExpiryTime?: string;
  reference: string;
}

export interface PaymentIntent {
  id: string;
  phone: string;
  macAddress: string;
  ipAddress: string;
  packageId: string;
  routerId: string;
  amountKsh: number;
  method: PaymentMethod;
  status: "pending" | "success" | "failed";
  merchantRequestId?: string;
  checkoutRequestId?: string;
  resultCode?: number;
  resultDesc?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Voucher {
  id: string;
  code: string;
  packageId: string;
  expiryDate: string;
  status: "used" | "unused";
  sentToPhone?: string;
  usedByPhone?: string;
  usedAt?: string;
  createdAt: string;
}

export interface Subscription {
  trialEndsAt: string;
  paidUntil?: string;
  lockReason?: string;
  billingAnchorDay?: number;
  pendingPaystackReference?: string;
}

export interface Tenant {
  id: string;
  businessName: string;
  businessLogoUrl?: string;
  createdAt: string;
  subscription: Subscription;
}

export interface Database {
  tenant: Tenant;
  adminUsers: AdminUser[];
  routers: RouterConfig[];
  packages: WifiPackage[];
  hotspotUsers: HotspotUser[];
  sessions: Session[];
  payments: PaymentLog[];
  paymentIntents: PaymentIntent[];
  vouchers: Voucher[];
}
