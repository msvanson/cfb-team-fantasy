import './globals.css';
import ThemeLoader from './theme-loader';

export const metadata={
  title:'CFB Team Fantasy',
  description:'2026 College Football Team Fantasy League'
};

export default function RootLayout({children}){
  return <html lang="en">
    <body>
      <ThemeLoader/>
      {children}
    </body>
  </html>;
}
