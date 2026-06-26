const sendWhatsAppMessage = async (lead) => {

    console.log("━━━━━━━━━━━━━━━━━━━");

    console.log("📱 WhatsApp Triggered");

    console.log("👤 Lead:", lead.name);

    console.log("📞 Number:", lead.phoneNumber);

    console.log("━━━━━━━━━━━━━━━━━━━");

    return {
        success: true
    };

};

module.exports = {
    sendWhatsAppMessage
};