import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { PersistedPayment } from "../../domain/payment-activity";
import { ActivityHistory } from "./activity-history";
import { PaymentProgressTimeline } from "./payment-progress-timeline";

const review: PersistedPayment = {
  id: "e46fc276-6f38-4aeb-a392-0f9ab270de11",
  status: "awaiting_confirmation",
  route: { id: "stellar_to_base_cctp", sourceNetwork: "stellar", destinationNetwork: "base", rail: "circle_cctp_standard" },
  recipientAddress: "0xde67a35b322e5a31e8215b5245ca4e48d7977f71",
  expectedAmount: "0.1",
  verifiedRecipient: null,
  verifiedAmount: null,
  asset: "USDC",
  fees: [],
  sourceTransaction: null,
  destinationTransaction: null,
  failureCode: null,
  createdAt: "2026-11-27T20:02:21.750Z",
  updatedAt: "2026-11-27T20:02:25.048Z",
  completedAt: null,
  events: [],
};

describe("activity before a recorded broadcast", () => {
  it("does not label a hashless awaiting-confirmation review as money in progress", () => {
    const html = renderToStaticMarkup(<ActivityHistory payments={[review]} onSelectPayment={() => {}} onOpenTimeline={() => {}} />);
    expect(html).toContain("status-badge awaiting-confirmation");
    expect(html).toContain("Awaiting Confirmation");
    expect(html).not.toContain("status-badge in-progress");
  });

  it("shows the review as awaiting owner confirmation, without a submitted claim", () => {
    const html = renderToStaticMarkup(<PaymentProgressTimeline payment={review} events={[]} />);
    expect(html).toContain("Awaiting Your Confirmation");
    expect(html).toContain("No source transaction is recorded");
    expect(html).not.toContain("Payment Delivered &amp; Finalized");
  });
});
