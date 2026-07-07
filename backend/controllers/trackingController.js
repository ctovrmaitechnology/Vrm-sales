const { FRONTEND_BASE_URL, POSTER_URL, BACKEND_BASE_URL } = require('../utils/config');
const { getCookieValue } = require('../utils/helpers');
const { decodeLeadRef } = require('../services/trackingService');
const { getLeadByEmail, updateUnifiedLeadStatus } = require('../unifiedDb');

async function trackDemo(req, res) {
  console.log(`[tracking] Demo hit: ${req.method} ${req.originalUrl}`);
  const ref = req.query.ref || getCookieValue(req, 'vrm_lead_ref');
  const queryEmail = String(req.query.email || "").trim();
  const clickKind = String(req.query.kind || "demo").trim().toLowerCase();
  const isVideoClick = clickKind === "video";

  if (ref || queryEmail) {
    try {
      const email = ref ? decodeLeadRef(ref) : queryEmail;
      const user = await getLeadByEmail(email);

      if (!user?.initialEmailSent) {
        console.log(`${isVideoClick ? "Video" : "Demo"} tracking skipped. Initial email not sent:`, email);
        if (req.query.redirectUrl) {
          return res.redirect(String(req.query.redirectUrl));
        }
        return res.redirect(`${FRONTEND_BASE_URL}/contactus/#send-message-section`);
      }

      const currentStatus = user?.Status || user?.status || "sent";
      const nextStatus = isVideoClick ? currentStatus : "clicked";

      await updateUnifiedLeadStatus(user || { email }, "email", nextStatus, isVideoClick ? "video_clicked" : "demo_clicked", {
        Status: nextStatus,
        clicked: true,
        clickCount: isVideoClick ? 0 : 1,
        clickKind: isVideoClick ? "video" : "demo"
      });

      console.log(`${isVideoClick ? "Video" : "Demo"} clicked by:`, email);

    } catch (error) {
      console.log("Demo tracking error:", error.message);
    }
  }

  if (req.query.redirectUrl) {
    return res.redirect(String(req.query.redirectUrl));
  }

  return res.redirect(`${FRONTEND_BASE_URL}/contactus/#send-message-section`);
}

async function trackPoster(req, res) {
  console.log(`[tracking] Poster hit: ${req.method} ${req.originalUrl}`);
  const ref = req.query.ref || getCookieValue(req, 'vrm_lead_ref');

  if (ref) {
    try {
      const email = decodeLeadRef(ref);

      res.cookie('vrm_lead_ref', ref, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: /^https:\/\//i.test(BACKEND_BASE_URL)
      });

      const user = await getLeadByEmail(email);

      if (!user?.initialEmailSent) {
        console.log("Poster tracking skipped. Initial email not sent:", email);
        return res.redirect(POSTER_URL);
      }

      await updateUnifiedLeadStatus(user || { email }, "email", "clicked", "poster_clicked", {
        clicked: true,
        clickCount: 1
      });

      console.log("Poster clicked by:", email);
    } catch (error) {
      console.log("Poster tracking error:", error.message);
    }
  }

  return res.redirect(POSTER_URL);
}

async function trackBookDemo(req, res) {
  console.log(`[tracking] Book demo hit: ${req.method} ${req.originalUrl}`);
  const ref = req.query.ref || req.query.email;
  const clickKind = String(req.query.kind || "demo").trim().toLowerCase();
  const isVideoClick = clickKind === "video";
  const redirectUrl =
    req.query.redirectUrl ||
    `${FRONTEND_BASE_URL}/contactus/#send-message-section`;

  if (ref) {
    try {
      const rawRef = decodeURIComponent(String(ref).trim());
      const email = rawRef.includes("@") ? rawRef : decodeLeadRef(rawRef);
      const user = await getLeadByEmail(email);

      if (!user || user.isDeleted || user.unsubscribeStatus) {
        console.log(`WhatsApp ${isVideoClick ? "video" : "demo"} tracking skipped. Lead not active: ${email}`);
        return res.redirect(redirectUrl);
      }

      await updateUnifiedLeadStatus(user, "whatsapp", "clicked", isVideoClick ? "video_clicked" : "demo_clicked", {
        whatsappStatus: "clicked",
        clicked: true,
        clickCount: 1,
        whatsappClickCount: 1,
        clickKind: isVideoClick ? "video" : "demo"
      });

      console.log(`WhatsApp ${isVideoClick ? "Video" : "Demo"} clicked by: ${email}`);
    } catch (error) {
      console.log("WhatsApp click tracking error:", error.message);
    }
  }

  return res.redirect(redirectUrl);
}

module.exports = {
  trackDemo,
  trackPoster,
  trackBookDemo
};
