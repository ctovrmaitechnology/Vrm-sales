const { FRONTEND_BASE_URL, POSTER_URL, BACKEND_BASE_URL } = require('../utils/config');
const { getCookieValue } = require('../utils/helpers');
const { decodeLeadRef } = require('../services/trackingService');
const { getUnifiedLeadByIdentifier, trackUnifiedClick } = require('../unifiedDb');

async function trackDemo(req, res) {
  console.log(`[tracking] Demo hit: ${req.method} ${req.originalUrl}`);
  const ref = req.query.ref || getCookieValue(req, 'vrm_lead_ref');
  const queryEmail = String(req.query.email || "").trim();
  const clickKind = String(req.query.kind || "demo").trim().toLowerCase();
  const isVideoClick = clickKind === "video";

  if (ref || queryEmail) {
    try {
      const email = ref ? decodeLeadRef(ref) : queryEmail;
      const user = await getUnifiedLeadByIdentifier(email);

      if (!user || user.isDeleted || user.unsubscribeStatus || user.status === 'deleted' || user.status === 'unsubscribed') {
        console.log(`${isVideoClick ? "Video" : "Demo"} tracking skipped. Lead not active:`, email);
        if (req.query.redirectUrl) {
          return res.redirect(String(req.query.redirectUrl));
        }
        return res.redirect(`${FRONTEND_BASE_URL}/contactus/#send-message-section`);
      }

      const nextStatus = "clicked";

      await trackUnifiedClick(email, "email", isVideoClick ? "video_clicked" : "demo_clicked");

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

      const user = await getUnifiedLeadByIdentifier(email);

      if (!user || user.isDeleted || user.unsubscribeStatus || user.status === 'deleted' || user.status === 'unsubscribed') {
        console.log("Poster tracking skipped. Lead not active:", email);
        return res.redirect(POSTER_URL);
      }

      await trackUnifiedClick(email, "email", "poster_clicked");

      console.log("Poster clicked by:", email);
    } catch (error) {
      console.log("Poster tracking error:", error.message);
    }
  }

  return res.redirect(POSTER_URL);
}

async function trackBookDemo(req, res) {
  console.log(`[tracking] Book demo hit: ${req.method} ${req.originalUrl}`);
  let ref = req.query.id || req.query.ref || req.query.email;
  let clickKind = String(req.query.kind || "demo").trim().toLowerCase();
  let redirectUrl = req.query.redirectUrl || `${FRONTEND_BASE_URL}/contactus/#send-message-section`;

  // Workaround for Meta WhatsApp API appending the dynamic parameter to the very end of the URL
  // instead of replacing the {{1}} placeholder inside the query string.
  if (!req.query.id && (ref === '{{1}}' || String(ref).includes('%7B%7B1%7D%7D'))) {
    if (req.query.redirectUrl) {
      // If the URL ended with the redirectUrl, the base64 ref got glued to it
      const match = req.query.redirectUrl.match(/(.*(?:mp4|section))([a-zA-Z0-9+/=]+(?:%3D|=)*)$/i);
      if (match && match.length === 3) {
        redirectUrl = match[1];
        ref = match[2];
      } else {
        // Fallback robust extraction
        const parts = req.query.redirectUrl.split(/(?=\w{20,}(?:%3D|=)*$)/);
        if (parts.length > 1) {
           redirectUrl = parts[0];
           ref = parts[1];
        }
      }
    } else if (req.query.kind) {
      // If there was no redirectUrl, it might have glued to kind
      const match = req.query.kind.match(/(demo|video)(.*)/i);
      if (match && match.length === 3 && match[2].length > 5) {
        clickKind = match[1].toLowerCase();
        ref = match[2];
      }
    }
  }

  const isVideoClick = clickKind === "video";

  if (ref) {
    try {
      const rawRef = decodeURIComponent(String(ref).trim());
      const email = rawRef.includes("@") ? rawRef : decodeLeadRef(rawRef);
      const user = await getUnifiedLeadByIdentifier(email);

      if (!user || user.isDeleted || user.unsubscribeStatus || user.status === 'deleted' || user.status === 'unsubscribed') {
        console.log(`WhatsApp ${isVideoClick ? "video" : "demo"} tracking skipped. Lead not active: ${email}`);
        return res.redirect(redirectUrl);
      }

      const identifier = user?.whatsapp_number || user?.phone || user?.phoneNumber || email;
      await trackUnifiedClick(identifier, "whatsapp", isVideoClick ? "video_clicked" : "demo_clicked");

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
