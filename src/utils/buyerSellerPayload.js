// Single mapper used by HomeProductFeed AND SharedProductPage so the
// BuyNowModal always receives the exact same shape.
export function effectiveLeadTime(s) {
    return s.stock_type === "made_to_order" ? s.production_lead_time_days : s.dispatch_time_days;
}

export function toBuyerSellerPayload(s) {
    return {
        offerId: s.submission_id,
        sellerId: s.seller_id,
        display_name: s.display_name,
        unit: s.unit,
        moq: s.moq,
        price: s.price,
        gstPercent: s.gst_percent,
        availableStock: s.stock_quantity ?? null,
        stockType: s.stock_type,
        leadTime: effectiveLeadTime(s),
        transportPreference: s.transportPreference || null,
        transportPendingProposal: s.transportPendingProposal || null,
        dispatchTimeDays: s.dispatch_time_days,
        productionLeadTimeDays: s.production_lead_time_days,
        priceSlabs: s.price_slabs || [],
        quantityDiscounts: s.quantity_discounts || [],
        paymentTerms: s.payment_terms,
        returnPolicy: s.return_policy,
        warranty: s.warranty,
        deliveryTimeline: s.delivery_timeline,
        freightIncluded: s.freight_included,
        transportOptions: s.seller_profiles?.transport_options || s.transport_options || [],
        priceBasis: s.price_basis,
        dispatchOrigin: [s.dispatch_district, s.dispatch_state].filter(Boolean).join(", ") || null,
        dispatchPincode: s.dispatch_pincode,
        dispatchState: s.dispatch_state,
        packSize: s.pack_size,
        masterPackSize: s.units_per_master_pack,
        sampleAvailable: s.sample_available || false,
        sampleQuantity: s.sample_quantity ?? null,
        samplePrice: s.sample_price ?? null,
    };
}