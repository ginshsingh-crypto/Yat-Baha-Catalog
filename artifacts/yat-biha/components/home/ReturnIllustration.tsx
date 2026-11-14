import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

/** A decorative, code-native illustration. No text, user data, or mirrored logos. */
export function ReturnIllustration({ width = 146 }: { width?: number }) {
  return (
    <Svg width={width} height={width * 1.16} viewBox="0 0 180 208" accessible={false}>
      <Ellipse cx="87" cy="184" rx="63" ry="11" fill="#081D27" opacity="0.38" />
      <Path d="M36 150C8 133 23 92 49 94C84 96 65 161 115 157C157 154 158 106 127 86" fill="none" stroke="#77CCCB" strokeWidth="2" strokeDasharray="3 7" opacity="0.65" />
      <G rotation="-12" origin="74,76">
        <Rect x="31" y="28" width="99" height="124" rx="21" fill="#AEE3DD" />
        <Rect x="37" y="34" width="87" height="112" rx="16" fill="#F1FBF6" />
        <Rect x="57" y="47" width="46" height="5" rx="2.5" fill="#B7D9D4" />
        <Circle cx="80" cy="84" r="20" fill="#D9EEE8" />
        <Path d="M68 83L76 91L91 75" fill="none" stroke="#177F79" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <Rect x="53" y="116" width="53" height="4" rx="2" fill="#C1DCD5" />
        <Rect x="64" y="126" width="31" height="4" rx="2" fill="#D5E9E2" />
      </G>
      <G rotation="11" origin="122,139">
        <Rect x="73" y="109" width="97" height="64" rx="14" fill="#F7A333" />
        <Path d="M85 113H157" stroke="#FFD18B" strokeWidth="2" strokeLinecap="round" />
        <Rect x="133" y="129" width="37" height="24" rx="8" fill="#D87916" />
        <Circle cx="145" cy="141" r="3" fill="#FFE7BF" />
        <Path d="M84 159H111" stroke="#CB7218" strokeWidth="2" strokeLinecap="round" />
      </G>
      <Circle cx="31" cy="151" r="17" fill="#087F8C" stroke="#66C4C7" strokeWidth="1.5" />
      <Circle cx="29" cy="147" r="5" fill="none" stroke="#EAF9F5" strokeWidth="2" />
      <Path d="M32 151L38 158M36 156L39 153" stroke="#EAF9F5" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="149" cy="42" r="4" fill="#F3AB49" />
      <Circle cx="20" cy="66" r="2" fill="#86D0CC" />
      <Line x1="150" y1="69" x2="150" y2="77" stroke="#9FDCD3" strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="146" y1="73" x2="154" y2="73" stroke="#9FDCD3" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
