import React from 'react';
import ChannelCard from '../components/ChannelCard';
import { MessageCircle, Mail } from 'lucide-react';
import Linkedin from '../components/LinkedinIcon';

const Home = () => {
  return (
    <div>
      <div style={{ marginBottom: '3rem', textAlign: 'center', maxWidth: '800px', margin: '0 auto 3rem auto' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-dark)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
          Sales Agent Dashboard
        </h1>
        <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Your unified command center for AI-powered outreach automation. 
          Manage campaigns, track engagement, and close deals faster across all channels.
        </p>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <h2 className="section-title">Automation Channels</h2>
        <div className="dashboard-grid">
          <ChannelCard 
            title="LinkedIn Automation" 
            description="Automate connections, follow-ups, and profile visits to build your professional network at scale."
            icon={<Linkedin size={28} />}
            path="/app/linkedin"
          />
          
          <ChannelCard 
            title="WhatsApp Campaigns" 
            description="Engage prospects instantly with personalized WhatsApp messages and automated drip sequences."
            icon={<MessageCircle size={28} />}
            path="/app/whatsapp"
          />
          
          <ChannelCard 
            title="Email Outreach" 
            description="Send cold email campaigns with advanced personalization, tracking, and high deliverability."
            icon={<Mail size={28} />}
            path="/email"
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
