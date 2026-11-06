import React from 'react';

const AuroraBackground = () => {
  return (
    <div className="aurora-canvas-wrap" aria-hidden="true">
      {/* 1. Base Mesh Gradient Overlay */}
      <div className="aurora-mesh-gradient" />

      {/* 2. Soft Ambient Radial Glow Orbs */}
      <div className="aurora-orb aurora-orb-top-left" />
      <div className="aurora-orb aurora-orb-top-right" />
      <div className="aurora-orb aurora-orb-center-white" />
      <div className="aurora-orb aurora-orb-bottom-accent" />

      {/* 3. Flowing Abstract Curved Shapes (Pixel-perfect matching reference image) */}
      <svg
        className="aurora-abstract-curves"
        viewBox="0 0 1600 1000"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Wave 1: Primary Upper Wave Gradient */}
          <linearGradient id="aurora-wave-top-grad" x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stopColor="#CEE4FF" stopOpacity="0.8" />
            <stop offset="35%" stopColor="#DFEEFF" stopOpacity="0.6" />
            <stop offset="70%" stopColor="#F2F7FF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#C6DFFE" stopOpacity="0.75" />
          </linearGradient>

          {/* Wave 2: Secondary Overlapping Wave Gradient */}
          <linearGradient id="aurora-wave-mid-grad" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#BEDCFF" stopOpacity="0.7" />
            <stop offset="45%" stopColor="#D8ECFF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#EBF5FF" stopOpacity="0.25" />
          </linearGradient>

          {/* Wave 3: Mid-Lower Ambient Wave Gradient */}
          <linearGradient id="aurora-wave-bot-grad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#DCEDFF" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#C8E1FF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#E4F1FF" stopOpacity="0.55" />
          </linearGradient>

          {/* Wave 4: Deep Lower Wave Gradient */}
          <linearGradient id="aurora-wave-deep-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EAF3FF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#D4E7FF" stopOpacity="0.45" />
          </linearGradient>

          {/* Luminous Wave Crest Highlight Strokes */}
          <linearGradient id="aurora-stroke-highlight-1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#B2D4FF" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#A8CEFE" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="aurora-stroke-highlight-2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A8CDFE" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#B8D7FE" stopOpacity="0.7" />
          </linearGradient>

          {/* Dark Mode Gradients */}
          <linearGradient id="aurora-dark-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#1e293b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.08" />
          </linearGradient>

          <linearGradient id="aurora-dark-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
            <stop offset="60%" stopColor="#0f172a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* 1. Primary graceful curved ribbon sweeping under search bar and behind Dashboard Overview */}
        <path
          d="M -50 130 C 320 240, 680 100, 1080 170 C 1340 215, 1500 140, 1650 175 L 1650 1100 L -50 1100 Z"
          fill="url(#aurora-wave-top-grad)"
          className="aurora-wave-shape-1"
        />
        <path
          d="M -50 130 C 320 240, 680 100, 1080 170 C 1340 215, 1500 140, 1650 175"
          stroke="url(#aurora-stroke-highlight-1)"
          strokeWidth="2"
          className="aurora-wave-edge-1"
        />

        {/* 2. Secondary deeper wave flowing across KPI cards */}
        <path
          d="M -50 260 C 380 380, 720 200, 1040 290 C 1300 360, 1520 250, 1650 295 L 1650 1100 L -50 1100 Z"
          fill="url(#aurora-wave-mid-grad)"
          className="aurora-wave-shape-2"
        />
        <path
          d="M -50 260 C 380 380, 720 200, 1040 290 C 1300 360, 1520 250, 1650 295"
          stroke="url(#aurora-stroke-highlight-2)"
          strokeWidth="1.75"
          className="aurora-wave-edge-2"
        />

        {/* 3. Lower flowing wave giving depth behind Universal Search & Workload section */}
        <path
          d="M -50 490 C 360 420, 720 560, 1120 470 C 1380 410, 1520 510, 1650 460 L 1650 1100 L -50 1100 Z"
          fill="url(#aurora-wave-bot-grad)"
          className="aurora-wave-shape-3"
        />
        <path
          d="M -50 490 C 360 420, 720 560, 1120 470 C 1380 410, 1520 510, 1650 460"
          stroke="rgba(255, 255, 255, 0.85)"
          strokeWidth="1.5"
          className="aurora-wave-edge-3"
        />

        {/* 4. Deep bottom wave behind Team Members table */}
        <path
          d="M -50 740 C 420 670, 820 810, 1220 720 C 1460 670, 1560 740, 1650 710 L 1650 1100 L -50 1100 Z"
          fill="url(#aurora-wave-deep-grad)"
          className="aurora-wave-shape-4"
        />
      </svg>
    </div>
  );
};

export default AuroraBackground;
