/**
 * Pricing utility to handle GST-compliant calculations.
 * Consistent across Frontend, Backend, and Invoices.
 * Shared Node.js (CommonJS) version for Karikku.
 */

const calculateItemPricing = (item, discountShare = 0) => {
    // Priority check for price in Karikku structure (this is the SELLING PRICE)
    const sellingPrice = parseFloat(
        item.variantCombination?.price || 
        item.currentPrice || 
        item.price || 
        item.productDetails?.price || 
        0
    );

    // Get Original Price (MRP including GST)
    const mrpUnitPrice = parseFloat(
        item.variantCombination?.originalPrice || 
        item.originalPrice || 
        item.productDetails?.originalPrice || 
        sellingPrice // Fallback to selling price
    );

    const quantity = parseInt(item.quantity || 1);
    
    // Priority check for GST in Karikku structure
    const rawGst = item.variantCombination?.gst || 
                   item.variantCombination?.taxPercentage || 
                   item.productDetails?.gst || 
                   item.productDetails?.taxPercentage || 
                   item.gstRate || 
                   5;
    const gstRate = parseFloat(rawGst) / 100;

    // Step 1: Calculate MRP Discount (Original - Selling)
    const mrpDiscount = Math.max(0, (mrpUnitPrice - sellingPrice) * quantity);

    // Step 2: Extract base price from Selling Price (per unit)
    const basePriceUnit = Math.round((sellingPrice / (1 + gstRate)) * 100) / 100;
    const basePriceTotal = Math.round(basePriceUnit * quantity * 100) / 100;

    // Step 3: Apply Transaction Discount (coupon/coins share) on base
    const discount = Math.min(discountShare, basePriceTotal);
    const taxableValue = Math.round(Math.max(0, basePriceTotal - discount) * 100) / 100;

    // Step 4: Calculate GST on taxable value
    const gstAmount = Math.round(taxableValue * gstRate * 100) / 100;
    const cgst = Math.round((gstAmount / 2) * 100) / 100;
    const sgst = Math.round((gstAmount - cgst) * 100) / 100;

    // Step 5: Individual Item Total (Selling Price after coupon)
    const itemTotal = Math.round((taxableValue + gstAmount) * 100) / 100;

    return {
        productId: item.productId || item.id,
        name: item.productDetails?.name || item.name || 'Product',
        unitMrp: mrpUnitPrice,
        totalMrp: mrpUnitPrice * quantity,
        unitSellingPrice: sellingPrice,
        totalSellingPrice: sellingPrice * quantity,
        basePrice: basePriceTotal,
        mrpDiscount: mrpDiscount, // The "Discount on MRP" row
        discount: discount,       // The "Coupon savings" share
        taxableValue,
        gstAmount,
        cgst,
        sgst,
        total: itemTotal
    };
};

const calculateCartTotals = (cartItems, totalDiscount = 0, deliveryCharge = 0, codCharge = 0, paymentMethod = 'prepaid', applicableProductIds = null) => {
    const items = cartItems || [];
    const isCod = paymentMethod.toLowerCase() === 'cod';
    const activeCodCharge = isCod ? parseFloat(codCharge || 0) : 0;
    const activeDeliveryCharge = parseFloat(deliveryCharge || 0);

    // Initial pass to get base prices for proportional discount distribution
    let totalBasePrice = 0;
    let totalApplicableBasePrice = 0;

    const itemBases = items.map(item => {
        const rawGst = item.variantCombination?.gst || 
                       item.variantCombination?.taxPercentage || 
                       item.productDetails?.gst || 
                       item.productDetails?.taxPercentage || 
                       item.gstRate || 
                       5;
        const gstRate = parseFloat(rawGst) / 100;
        
        const price = parseFloat(
            item.variantCombination?.price || 
            item.currentPrice || 
            item.price || 
            item.productDetails?.price || 
            0
        );
        const quantity = parseInt(item.quantity || 1);
        const basePriceUnit = Math.round((price / (1 + gstRate)) * 100) / 100;
        const basePriceTotal = Math.round(basePriceUnit * quantity * 100) / 100;
        
        totalBasePrice += basePriceTotal;

        // Check if this item is applicable for the coupon discount
        const productId = item.productId || item.id;
        const isApplicable = !applicableProductIds || 
                            applicableProductIds.includes(productId) || 
                            applicableProductIds.includes(String(productId));
        
        if (isApplicable) {
            totalApplicableBasePrice += basePriceTotal;
        }

        return { basePriceTotal, isApplicable };
    });

    // Distribute total discount proportionally across ONLY applicable items
    let distributedDiscountTotal = 0;
    const applicableItemsCount = itemBases.filter(b => b.isApplicable).length;
    let processedApplicableCount = 0;

    const itemPricingBreakdown = items.map((item, index) => {
        let discountShare = 0;
        const { basePriceTotal, isApplicable } = itemBases[index];

        if (totalDiscount > 0 && isApplicable && totalApplicableBasePrice > 0) {
            processedApplicableCount++;
            if (processedApplicableCount === applicableItemsCount) {
                // Last applicable item gets the remaining discount to ensure sum == totalDiscount
                discountShare = Math.round((totalDiscount - distributedDiscountTotal) * 100) / 100;
            } else {
                discountShare = Math.round((basePriceTotal / totalApplicableBasePrice) * totalDiscount * 100) / 100;
                distributedDiscountTotal += discountShare;
            }
        }
        return calculateItemPricing(item, discountShare);
    });

    // Aggregate totals
    const summary = itemPricingBreakdown.reduce((acc, curr) => {
        acc.totalMrp += curr.totalMrp;
        acc.basePrice += curr.basePrice;
        acc.mrpDiscount += curr.mrpDiscount;
        acc.discount += curr.discount;
        acc.taxableValue += curr.taxableValue;
        acc.gstAmount += curr.gstAmount;
        acc.cgst += curr.cgst;
        acc.sgst += curr.sgst;
        return acc;
    }, {
        totalMrp: 0,
        basePrice: 0,
        mrpDiscount: 0,
        discount: 0,
        taxableValue: 0,
        gstAmount: 0,
        cgst: 0,
        sgst: 0
    });

    // Round aggregated values
    summary.totalMrp = Math.round(summary.totalMrp * 100) / 100;
    summary.basePrice = Math.round(summary.basePrice * 100) / 100;
    summary.mrpDiscount = Math.round(summary.mrpDiscount * 100) / 100;
    summary.discount = Math.round(summary.discount * 100) / 100;
    summary.taxableValue = Math.round(summary.taxableValue * 100) / 100;
    summary.gstAmount = Math.round(summary.gstAmount * 100) / 100;
    summary.cgst = Math.round(summary.cgst * 100) / 100;
    summary.sgst = Math.round(summary.sgst * 100) / 100;

    // Final total including delivery and COD
    const total = Math.round(summary.taxableValue + summary.gstAmount + activeDeliveryCharge + activeCodCharge);

    return {
        ...summary,
        delivery: activeDeliveryCharge,
        codCharge: activeCodCharge,
        total,
        totalMRP: summary.totalMrp,        // Compatibility Alias
        subtotal: summary.taxableValue,   // Compatibility Alias
        gstAmount: summary.gstAmount,      // Consistency
        totalSavings: summary.mrpDiscount + summary.discount, // display
        discountAmount: summary.discount,  // Consistency
        finalTotal: total,                 // Compatibility Alias
        deliveryCharge: activeDeliveryCharge, // Compatibility Alias
        itemsPricing: itemPricingBreakdown
    };
};


module.exports = {
    calculateItemPricing,
    calculateCartTotals
};
