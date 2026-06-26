import React from 'react';

const Button = ({ children, variant = 'primary', className = '', icon, ...props }) => {
  const baseClass = 'btn';
  const variantClass = `btn-${variant}`;
  
  return (
    <button className={`${baseClass} ${variantClass} ${className}`} {...props}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;
