import { ReactNode } from 'react';
type ButtonProps = {
    children: ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    to?: string;
    className?: string;
    onClick?: () => void;
};
export declare function Button({ children, variant, size, to, className, onClick }: ButtonProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=Button.d.ts.map