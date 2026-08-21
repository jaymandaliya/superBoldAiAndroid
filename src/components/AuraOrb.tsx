import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTrackVolume } from '@livekit/react-native';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';

type AuraOrbProps = {
  agentTrack?: LocalAudioTrack | RemoteAudioTrack | null;
  localTrack?: LocalAudioTrack | RemoteAudioTrack | null;
  /**
   * Optional secondary amplitude source (0..1). Use this for the local
   * participant — LiveKit RN's useTrackVolume only reliably reads RECEIVED
   * audio, so we feed local audio in here from `participant.audioLevel`.
   */
  externalAmp?: number;
  size?: number;
  color?: string;
  debug?: boolean;
  children?: React.ReactNode;
};

/**
 * Aura-style audio visualizer that runs the LiveKit / Unicorn Studio GLSL
 * shader inside a WebView. Audio amplitude from `useTrackVolume` is forwarded
 * to the shader via injected JS — produces a pixel-identical match to the
 * React/web Aura component.
 *
 * Shader is Polyform-Non-Resale-1.0.0 © UNCRN LLC.
 */
export default function AuraOrb({
  agentTrack,
  localTrack,
  externalAmp,
  size = 320,
  color = '#7C6BFF',
  debug = false,
  children,
}: AuraOrbProps) {
  const agentVol = useTrackVolume(agentTrack ?? undefined);
  const localVol = useTrackVolume(localTrack ?? undefined);
  // Take the loudest of: agent received-volume, local received-volume (often 0),
  // and the externally-supplied amplitude (e.g. localParticipant.audioLevel).
  const activeVol = Math.max(agentVol ?? 0, localVol ?? 0, externalAmp ?? 0);

  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const colorTriple = useMemo(() => {
    const m = color.match(/^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
    if (!m) return '0.486, 0.420, 1.0';
    return `${parseInt(m[1], 16) / 255}, ${parseInt(m[2], 16) / 255}, ${parseInt(m[3], 16) / 255}`;
  }, [color]);

  const html = useMemo(() => buildAuraHtml(colorTriple), [colorTriple]);

  useEffect(() => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__aura&&window.__aura.setAmp(${activeVol.toFixed(4)});true;`,
    );
  }, [activeVol]);

  // Update color whenever it changes (parent flips between agent_speaking and idle).
  useEffect(() => {
    if (!readyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.__aura&&window.__aura.setColor(${colorTriple});true;`,
    );
  }, [colorTriple]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode={Platform.OS === 'android' ? 'always' : undefined}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (msg === 'ready') {
            readyRef.current = true;
            // Push current values immediately on mount.
            webRef.current?.injectJavaScript(
              `window.__aura.setColor(${colorTriple});window.__aura.setAmp(${activeVol.toFixed(4)});true;`,
            );
          } else if (debug) {
            // eslint-disable-next-line no-console
            console.log('[AuraOrb]', msg);
          }
        }}
        onError={(e) => {
          // eslint-disable-next-line no-console
          console.warn('[AuraOrb] WebView error', e.nativeEvent);
        }}
        // iOS-only transparency. Type-cast since the prop is platform-specific.
        {...({ opaque: false } as any)}
      />
      {children ? (
        <View style={styles.center} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function buildAuraHtml(rgbColorTriple: string): string {
  const fragShader = String.raw`
precision highp float;
const float TAU = 6.283185;
uniform vec2  iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uBlur;
uniform float uScale;
uniform float uFrequency;
uniform float uAmplitude;
uniform float uMix;
uniform float uSpacing;
uniform float uColorShift;
uniform float uVariance;
uniform float uSmoothing;
uniform vec3  uColor;

vec2 randFibo(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.xx+p.yx)*p.xy);}
vec3 Tonemap(vec3 x){x*=4.0;return x/(1.0+x);}
float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1e-10;return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.,2./3.,1./3.,3.);vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}
float sdCircle(vec2 st,float r){return length(st)-r;}
vec2 turb(vec2 pos,float t,float it){
  mat2 rotation=mat2(0.6,-0.25,0.25,0.9);
  mat2 layerRotation=mat2(0.6,-0.8,0.8,0.6);
  float frequency=mix(2.0,15.0,uFrequency);
  float amplitude=uAmplitude;
  float frequencyGrowth=1.4;
  float animTime=t*0.1*uSpeed;
  for(int i=0;i<4;i++){
    vec2 rotatedPos=pos*rotation;
    vec2 wave=sin(frequency*rotatedPos+float(i)*animTime+it);
    pos+=(amplitude/frequency)*rotation[0]*wave;
    rotation*=layerRotation;
    amplitude*=mix(1.0,max(wave.x,wave.y),uVariance);
    frequency*=frequencyGrowth;
  }
  return pos;
}
const float ITERATIONS=28.0;
void main(){
  vec2 fragCoord=gl_FragCoord.xy;
  vec2 uv=fragCoord/iResolution.xy;
  vec3 pp=vec3(0.0);
  vec3 bloom=vec3(0.0);
  float t=iTime*0.5;
  vec2 pos=uv-0.5;
  vec2 prevPos=turb(pos,t,0.0-1.0/ITERATIONS);
  float spacing=mix(1.0,TAU,uSpacing);
  for(float i=1.0;i<ITERATIONS+1.0;i++){
    float iter=i/ITERATIONS;
    vec2 st=turb(pos,t,iter*spacing);
    float d=abs(sdCircle(st,uScale));
    float pd=distance(st,prevPos);
    prevPos=st;
    float dynamicBlur=exp2(pd*2.0*1.4426950408889634)-1.0;
    float ds=smoothstep(0.0,uBlur*0.05+max(dynamicBlur*uSmoothing,0.001),d);
    vec3 c=uColor;
    if(uColorShift>0.01){
      vec3 hsv=rgb2hsv(c);
      hsv.x=fract(hsv.x+(1.0-iter)*uColorShift*0.3);
      c=hsv2rgb(hsv);
    }
    float invd=1.0/max(d+dynamicBlur,0.001);
    pp+=(ds-1.0)*c;
    bloom+=clamp(invd,0.0,250.0)*c;
  }
  pp*=1.0/ITERATIONS;
  bloom=bloom/(bloom+2e4);
  vec3 color=(-pp+bloom*1.5)*1.2;
  color+=(randFibo(fragCoord).x-0.5)/255.0;
  color=Tonemap(color);
  float alpha=luma(color)*uMix;
  // Radial vignette — fades the whole orb to fully transparent toward the
  // canvas corners so the WebView shows no rectangular edge.
  float r=distance(uv,vec2(0.5));
  float vignette=1.0-smoothstep(0.30,0.50,r);
  vignette=clamp(vignette,0.0,1.0);
  alpha*=vignette;
  color*=vignette;
  gl_FragColor=vec4(color*uMix,alpha);
}`;

  return String.raw`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1">
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%;}
  canvas{width:100%;height:100%;display:block;background:transparent;}
</style>
</head><body>
<canvas id="c"></canvas>
<script>
(function(){
  function log(m){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(String(m));}catch(_){}}
  var canvas=document.getElementById('c');
  var dpr=Math.min(window.devicePixelRatio||1,2);
  function fit(){
    var w=Math.max(1,window.innerWidth);
    var h=Math.max(1,window.innerHeight);
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
  }
  fit();
  window.addEventListener('resize',fit);

  var gl=canvas.getContext('webgl',{premultipliedAlpha:true,antialias:true,alpha:true,preserveDrawingBuffer:false})
       ||canvas.getContext('experimental-webgl',{premultipliedAlpha:true,antialias:true,alpha:true,preserveDrawingBuffer:false});
  if(!gl){log('aura:no-webgl');return;}
  log('aura:gl ok dpr='+dpr+' size='+canvas.width+'x'+canvas.height);

  var vs='attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
  var fs=` + JSON.stringify(fragShader) + `;
  function compile(t,s){
    var sh=gl.createShader(t);
    gl.shaderSource(sh,s);gl.compileShader(sh);
    if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
      log('aura:compile-fail '+(t===gl.VERTEX_SHADER?'vs':'fs')+': '+gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
  var v=compile(gl.VERTEX_SHADER,vs);
  var f=compile(gl.FRAGMENT_SHADER,fs);
  if(!v||!f){return;}
  var p=gl.createProgram();
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){log('aura:link-fail '+gl.getProgramInfoLog(p));return;}
  gl.useProgram(p);

  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  function u(n){return gl.getUniformLocation(p,n);}
  var U={
    iResolution:u('iResolution'),iTime:u('iTime'),uSpeed:u('uSpeed'),uBlur:u('uBlur'),
    uScale:u('uScale'),uFrequency:u('uFrequency'),uAmplitude:u('uAmplitude'),
    uMix:u('uMix'),uSpacing:u('uSpacing'),uColorShift:u('uColorShift'),
    uVariance:u('uVariance'),uSmoothing:u('uSmoothing'),uColor:u('uColor')
  };

  // Baseline amplitude so the orb is always visible even when silent.
  var IDLE_AMP=0.45;
  var ampTarget=IDLE_AMP,amp=IDLE_AMP,t0=performance.now();
  var colR=` + rgbColorTriple.split(',')[0] + `,colG=` + rgbColorTriple.split(',')[1] + `,colB=` + rgbColorTriple.split(',')[2] + `;
  window.__aura={
    setAmp:function(v){
      // Map raw volume into [IDLE_AMP .. 1] so the orb always has visible motion.
      var raw=Math.max(0,Math.min(1,+v||0));
      ampTarget=IDLE_AMP+(1-IDLE_AMP)*raw;
    },
    setColor:function(r,g,b){colR=+r;colG=+g;colB=+b;}
  };

  // Note: NO blending — we want the shader's RGB to write directly. Alpha is
  // handled by the canvas transparent CSS background.
  log('ready');

  function frame(now){
    var t=(now-t0)/1000;
    var rising=ampTarget>amp;
    var k=rising?0.25:0.04;
    amp+=(ampTarget-amp)*k;

    var speed=1.0+amp*2.5;
    var amplitude=0.6+amp*0.5;
    var frequency=0.45+amp*0.4;
    var scale=0.22+amp*0.10;
    var brightness=1.6+amp*0.6;

    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.iResolution,canvas.width,canvas.height);
    gl.uniform1f(U.iTime,t);
    gl.uniform1f(U.uSpeed,speed);
    gl.uniform1f(U.uBlur,0.2);
    gl.uniform1f(U.uScale,scale);
    gl.uniform1f(U.uFrequency,frequency);
    gl.uniform1f(U.uAmplitude,amplitude);
    gl.uniform1f(U.uMix,brightness);
    gl.uniform1f(U.uSpacing,0.5);
    gl.uniform1f(U.uColorShift,0.05);
    gl.uniform1f(U.uVariance,0.1);
    gl.uniform1f(U.uSmoothing,1.0);
    gl.uniform3f(U.uColor,colR,colG,colB);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body></html>`;
}
