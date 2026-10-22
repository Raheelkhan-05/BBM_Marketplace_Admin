const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// null unless the order is awaiting payment.
export function orderPriceInfo(order) {
    if (!order || order.status !== "awaiting_payment") return null;
    const stored = r2(order.total_amount);
    const rp = order.repriced || null;
    const blocked = rp?.blocked_code ? { code: rp.blocked_code, product: rp.blocked_product || null } : null;
    const live = rp && !blocked ? r2(rp.current_total) : stored;

    let from = null, to = null;
    if (live !== stored) { from = stored; to = live; }                 // seller changed it, not applied yet
    else if (order.price_revised_from != null && r2(order.price_revised_from) !== stored) {
        from = r2(order.price_revised_from); to = stored;              // already applied at an earlier "pay" tap
    }
    return {
        current: live, stored, blocked,
        changed: from != null, from, to,
        direction: from != null ? (to > from ? "up" : "down") : null,
    };
}

export function groupPriceInfo(orders) {
    let combined = 0, unpaidTotal = 0, from = 0, to = 0, changed = false, blocked = null;
    for (const o of orders) {
        const info = orderPriceInfo(o);
        const cur = info ? info.current : r2(o.total_amount);
        combined += cur;
        if (!info) continue;
        unpaidTotal += cur;
        from += info.changed ? info.from : cur;
        to += info.changed ? info.to : cur;
        if (info.changed) changed = true;
        if (!blocked && info.blocked) blocked = info.blocked;
    }
    return { combined: r2(combined), unpaidTotal: r2(unpaidTotal), changed, from: r2(from), to: r2(to), blocked };
}

// Detail page: overlay live prices so items, totals and the PO document all agree.
export function applyRepricedView(order, info = orderPriceInfo(order)) {
    if (!order?.repriced || !info || info.blocked) return order;
    const byId = new Map((order.repriced.items || []).map((i) => [String(i.item_id), i]));
    return {
        ...order,
        subtotal_amount: info.current,
        total_amount: info.current,
        items: (order.items || []).map((it) => {
            const n = byId.get(String(it.id));
            return n ? { ...it, unit_price: n.unit_price, base_price_applied: n.base_price, discount_percent: n.discount_percent, line_total: n.line_total } : it;
        }),
    };
}