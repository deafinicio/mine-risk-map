/* EORE heat field: GPU accumulation + color/contour pass. Canvas fallback stays local. */
(() => {
  'use strict';
  const vertex = `#version 300 es
    in vec3 a_point;
    uniform vec2 u_size;
    uniform float u_radius;
    out float v_weight;
    void main(){ gl_Position=vec4(a_point.xy/u_size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.); gl_PointSize=u_radius*2.; v_weight=a_point.z; }`;
  const density = `#version 300 es
    precision highp float;
    in float v_weight;
    out vec4 outColor;
    void main(){ float d=length(gl_PointCoord*2.-1.); if(d>1.) discard; float k=exp(-d*d*5.)*(1.-smoothstep(.7,1.,d)); outColor=vec4(k*v_weight,0.,0.,1.); }`;
  const quad = `#version 300 es
    out vec2 v_uv;
    void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); v_uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
  const color = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_field;
    uniform sampler2D u_palette;
    uniform float u_time;
    uniform float u_opacity;
    out vec4 outColor;
    void main(){
      float value=texture(u_field,v_uv).r;
      float t=clamp(value,0.,1.);
      float a=smoothstep(.003,.075,value)*(.24+.55*sqrt(t))*u_opacity;
      vec3 c=texture(u_palette,vec2(t,.5)).rgb;
      float bands=abs(fract(t*7.)-.5);
      float line=(1.-smoothstep(.012,.035,bands))*smoothstep(.1,.25,t)*.13;
      float shimmer=sin(t*12.-u_time*.35)*.012;
      c+=vec3(line+shimmer);
      outColor=vec4(c,clamp(a,0.,.9));
    }`;
  function program(gl, vs, fs) {
    const shaders = [gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((type,i) => {
      const shader=gl.createShader(type); gl.shaderSource(shader,i ? fs : vs); gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){ const error=gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error); }
      return shader;
    });
    const result=gl.createProgram(); shaders.forEach(s=>gl.attachShader(result,s)); gl.linkProgram(result); shaders.forEach(s=>gl.deleteShader(s));
    if(!gl.getProgramParameter(result,gl.LINK_STATUS)){ const error=gl.getProgramInfoLog(result); gl.deleteProgram(result); throw new Error(error); } return result;
  }
  const GPUHeat = L.Layer.extend({
    initialize(points, options) { L.setOptions(this,options); this._latlngs=points; this._motion=!matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion!=='off'; this._frame=null; },
    onAdd(map) {
      this._map=map;
      this._canvas=L.DomUtil.create('canvas','leaflet-heatmap-layer leaflet-layer eore-gpu-heat leaflet-zoom-animated');
      this._canvas.style.pointerEvents='none'; this._canvas.setAttribute('aria-hidden','true');
      this._canvas.addEventListener('webglcontextlost',this._lost=(event)=>{event.preventDefault(); this._useFallback();});
      try {
        const gl=this._gl=this._canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
        if(!gl) throw new Error('WebGL2 unavailable');
        this._densityProgram=program(gl,vertex,density); this._colorProgram=program(gl,quad,color);
        this._buffer=gl.createBuffer(); this._vao=gl.createVertexArray(); gl.bindVertexArray(this._vao);
        gl.bindBuffer(gl.ARRAY_BUFFER,this._buffer);
        const loc=gl.getAttribLocation(this._densityProgram,'a_point'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);
        this._field=gl.createTexture(); this._palette=gl.createTexture(); this._fbo=gl.createFramebuffer();
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this._palette); this._textureOptions(gl);
        const canvas=document.createElement('canvas'); canvas.width=256;canvas.height=1; const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,256,0);
        Object.entries(this.options.gradient).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([stop,hex])=>gradient.addColorStop(Number(stop),hex)); ctx.fillStyle=gradient;ctx.fillRect(0,0,256,1);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        this._canvas.dataset.renderer='webgl2'; map.getPanes().overlayPane.appendChild(this._canvas);
        map.on('moveend resize',this._reset,this); map.on('zoomanim',this._animateZoom,this);
        document.addEventListener('visibilitychange',this._visibility=()=>this._schedule());
        this._reset();
      } catch(error) { this._fallbackReason=error.message; this._useFallback(); }
      document.addEventListener('eore:motion',this._motionHandler=event=>{this._motion=event.detail.enabled;this._schedule();});
    },
    _textureOptions(gl) { gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); },
    _useFallback() {
      if(!this._map || this._fallback) return;
      this._release(); this._canvas?.remove();
      this._fallback=L.heatLayer(this._latlngs,this.options).addTo(this._map);
      this._fallback._canvas.dataset.renderer='canvas';
      this._fallback._canvas.dataset.fallbackReason=this._fallbackReason||'context-lost';
    },
    _reset() {
      if(!this._gl || this._fallback || !this._map) return;
      const gl=this._gl, size=this._map.getSize(); if(!size.x || !size.y) return;
      this._size=size; this._ratio=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(1500000/(size.x*size.y)));
      const w=Math.max(1,Math.round(size.x*this._ratio)),h=Math.max(1,Math.round(size.y*this._ratio));
      this._canvas.width=w;this._canvas.height=h;this._canvas.style.width=size.x+'px';this._canvas.style.height=size.y+'px';
      L.DomUtil.setPosition(this._canvas,this._map.containerPointToLayerPoint([0,0]));
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._field);this._textureOptions(gl);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this._fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this._field,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){this._useFallback();return;}
      this._updateField();this._schedule();
    },
    _updateField() {
      if(!this._map || !this._gl || !this._size) return;
      const gl=this._gl,ratio=this._ratio,zoomFactor=1/Math.pow(2,Math.max(0,Math.min(this.options.maxZoom-this._map.getZoom(),12)));
      const radius=(this.options.radius+this.options.blur)*ratio,points=[];
      // Aggregate coincident sessions before upload; preserve additive participant weights.
      const cells=new Map();
      this._latlngs.forEach(row=>{const p=this._map.latLngToContainerPoint(row);if(p.x < -radius || p.y < -radius || p.x > this._size.x+radius || p.y > this._size.y+radius)return;const key=Math.round(p.x)+','+Math.round(p.y);const prior=cells.get(key);if(prior)prior[2]+=row[2]||0;else cells.set(key,[p.x,p.y,row[2]||0]);});
      cells.forEach(p=>points.push(p[0]*ratio,p[1]*ratio,Math.max(this.options.minOpacity,Math.min(1,p[2]*zoomFactor))));
      gl.bindFramebuffer(gl.FRAMEBUFFER,this._fbo);gl.viewport(0,0,this._canvas.width,this._canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._densityProgram);gl.bindVertexArray(this._vao);gl.bindBuffer(gl.ARRAY_BUFFER,this._buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);
      gl.uniform2f(gl.getUniformLocation(this._densityProgram,'u_size'),this._canvas.width,this._canvas.height);
      gl.uniform1f(gl.getUniformLocation(this._densityProgram,'u_radius'),Math.min(radius,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]/2));
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArrays(gl.POINTS,0,points.length/3);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    },
    _draw(time) {
      if(!this._gl || !this._map || this._fallback) return;
      const gl=this._gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this._canvas.width,this._canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this._colorProgram);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._field);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this._palette);
      gl.uniform1i(gl.getUniformLocation(this._colorProgram,'u_field'),0);gl.uniform1i(gl.getUniformLocation(this._colorProgram,'u_palette'),1);gl.uniform1f(gl.getUniformLocation(this._colorProgram,'u_time'),this._motion ? time/1000 : 0);gl.uniform1f(gl.getUniformLocation(this._colorProgram,'u_opacity'),1);gl.drawArrays(gl.TRIANGLES,0,3);
    },
    _schedule() {
      if(this._frame!==null)cancelAnimationFrame(this._frame);this._frame=null;
      this._draw(performance.now());
      if(!this._motion || document.hidden || !this._gl || this._fallback)return;
      let previous=0;
      const loop=time=>{ if(!this._map || !this._motion || document.hidden){this._frame=null;return;}if(time-previous>45){this._draw(time);previous=time;}this._frame=requestAnimationFrame(loop);};
      this._frame=requestAnimationFrame(loop);
    },
    redraw() { if(this._fallback){this._fallback.setLatLngs(this._latlngs);}else if(this._gl){this._updateField();this._schedule();}return this; },
    setLatLngs(points) { this._latlngs=points;return this.redraw(); },
    _animateZoom(event) { if(!this._canvas || this._fallback)return;const scale=this._map.getZoomScale(event.zoom);const offset=this._map._getCenterOffset(event.center).multiplyBy(-scale).subtract(this._map._getMapPanePos());L.DomUtil.setTransform(this._canvas,offset,scale); },
    _release() {
      if(this._frame!==null)cancelAnimationFrame(this._frame);this._frame=null;
      if(this._gl){const g=this._gl;this._canvas?.removeEventListener('webglcontextlost',this._lost);g.deleteBuffer(this._buffer);g.deleteVertexArray(this._vao);g.deleteTexture(this._field);g.deleteTexture(this._palette);g.deleteFramebuffer(this._fbo);g.deleteProgram(this._densityProgram);g.deleteProgram(this._colorProgram);this._gl=null;g.getExtension('WEBGL_lose_context')?.loseContext();}
      if(this._map){this._map.off('moveend resize',this._reset,this);this._map.off('zoomanim',this._animateZoom,this);}
      if(this._visibility)document.removeEventListener('visibilitychange',this._visibility);
    },
    onRemove(map) {
      this._release();document.removeEventListener('eore:motion',this._motionHandler);
      if(this._fallback){map.removeLayer(this._fallback);this._fallback=null;}
      if(this._canvas){this._canvas.removeEventListener('webglcontextlost',this._lost);this._canvas.remove();this._canvas=null;}
      this._map=null;
    }
  });
  L.sessionHeatLayer=(points,options)=>new GPUHeat(points,options);
})();
