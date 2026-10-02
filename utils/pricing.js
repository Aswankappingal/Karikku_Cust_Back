/**
 * Pricing utility to handle GST-compliant calculations.
 * Consistent across Frontend, Backend, and Invoices.
 * Shared Node.js (CommonJS) version for Karikku.
 */

const calculateItemPricing = (item, discountShare = 0) => {
    // Priority check for price in Karikku structure (this is the SELLING PRICE)
    const sellingPrice = parseFloat(
        item.variantCombination?.sellingPrice ||
        item.variantCombination?.price || 
        item.currentPrice || 
        item.price || 
        item.productDetails?.sellingPrice ||
        item.productDetails?.price || 
        0
    );

    // Get Original Price (MRP including GST)
    const mrpUnitPrice = parseFloat(
        item.variantCombination?.mrp ||
        item.variantCombination?.originalPrice || 
        item.originalPrice || 
        item.mrp ||
        item.productDetails?.mrp ||
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

    // Step 2: Total gross selling price before transaction discounts
    const grossSelling = sellingPrice * quantity;
    const basePriceUnit = sellingPrice;
    const basePriceTotal = grossSelling;

    // Step 3: Apply Transaction Discount (coupon/coins share)
    const discount = Math.min(discountShare, grossSelling);
    const finalItemGross = Math.max(0, grossSelling - discount);

    // Step 4: Calculate GST on top of the discounted amount
    const taxableValue = finalItemGross;
    const gstAmount = Math.round(taxableValue * gstRate * 100) / 100;
    const cgst = Math.round((gstAmount / 2) * 100) / 100;
    const sgst = Math.round((gstAmount - cgst) * 100) / 100;

    // Step 5: Individual Item Total (Discounted Selling Price + GST)
    const itemTotal = Math.round((taxableValue + gstAmount) * 100) / 100;

    return {
        productId: item.productId || item.id,
        name: item.productDetails?.name || item.name || 'Product',
        unitMrp: mrpUnitPrice,
        totalMrp: mrpUnitPrice * quantity,
        unitSellingPrice: sellingPrice,
        totalSellingPrice: grossSelling,
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

    // Initial pass to get gross prices for proportional discount distribution
    let totalGrossPrice = 0;
    let totalApplicableGrossPrice = 0;

    const itemBases = items.map(item => {
        const rawGst = item.variantCombination?.gst || 
                       item.variantCombination?.taxPercentage || 
                       item.productDetails?.gst || 
                       item.productDetails?.taxPercentage || 
                       item.gstRate || 
                       5;
        const gstRate = parseFloat(rawGst) / 100;
        
        const price = parseFloat(
            item.variantCombination?.sellingPrice ||
            item.variantCombination?.price || 
            item.currentPrice || 
            item.price || 
            item.productDetails?.sellingPrice ||
            item.productDetails?.price || 
            0
        );
        const quantity = parseInt(item.quantity || 1);
        const grossItemPrice = price * quantity;
        const basePriceUnit = price;
        const basePriceTotal = grossItemPrice;
        
        totalGrossPrice += grossItemPrice;

        // Check if this item is applicable for the coupon discount
        const productId = item.productId || item.id;
        const isApplicable = !applicableProductIds || 
                            applicableProductIds.includes(productId) || 
                            applicableProductIds.includes(String(productId));
        
        if (isApplicable) {
            totalApplicableGrossPrice += grossItemPrice;
        }

        return { grossItemPrice, basePriceTotal, isApplicable };
    });

    // Distribute total discount proportionally across ONLY applicable items
    let distributedDiscountTotal = 0;
    const applicableItemsCount = itemBases.filter(b => b.isApplicable).length;
    let processedApplicableCount = 0;

    const itemPricingBreakdown = items.map((item, index) => {
        let discountShare = 0;
        const { grossItemPrice, isApplicable } = itemBases[index];

        if (totalDiscount > 0 && isApplicable && totalApplicableGrossPrice > 0) {
            processedApplicableCount++;
            if (processedApplicableCount === applicableItemsCount) {
                // Last applicable item gets the remaining discount to ensure sum == totalDiscount
                discountShare = Math.round((totalDiscount - distributedDiscountTotal) * 100) / 100;
            } else {
                discountShare = Math.round((grossItemPrice / totalApplicableGrossPrice) * totalDiscount * 100) / 100;
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
        totalMRP: summary.totalMrp,        // Compatibility Alias: Total MRP
        totalMrp: summary.totalMrp,
        subtotal: summary.totalMrp,        // Standardized Subtotal to Total MRP
        totalSellingPrice: Math.round((summary.totalMrp - summary.mrpDiscount) * 100) / 100,
        gstAmount: summary.gstAmount,      // Consistency
        gst: summary.gstAmount,            // Compatibility Alias
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
