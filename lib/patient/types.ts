export type DemoPaymentMethod = "gcash" | "paymaya" | "card";

/** Exact row shape returned by public.demo_payment_simulations. */
export type DemoPaymentSimulationRecord = {
  id: string;
  patient_id: string;
  bill_id: string;
  reference_number: string;
  amount: number;
  payment_method: DemoPaymentMethod;
  status: "simulated";
  idempotency_key: string;
  created_at: string;
};

/** Fields needed to append the server's just-created result before a reload. */
export type DemoPaymentHistoryItem = Pick<
  DemoPaymentSimulationRecord,
  "id" | "bill_id" | "reference_number" | "amount" | "payment_method" | "status" | "created_at"
>;
