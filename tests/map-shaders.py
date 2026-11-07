"""Compile and render production GLSL with Mesa/EGL, without a browser."""
import ctypes as C, re
from pathlib import Path
E=C.CDLL('libEGL.so.1'); I=C.c_int; U=C.c_uint; F=C.c_float; P=C.c_void_p
E.eglGetProcAddress.restype=P; E.eglGetProcAddress.argtypes=[C.c_char_p]
def fn(name,ret,args): return C.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
platform=fn('eglGetPlatformDisplayEXT',P,[U,P,C.POINTER(I)])
d=platform(0x31DD,None,None)
E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)]; a,b=I(),I();assert E.eglInitialize(d,C.byref(a),C.byref(b))
E.eglBindAPI.argtypes=[U];assert E.eglBindAPI(0x30A0)
attrs=(I*15)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038,0,0)
E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];cfg=P();n=I();assert E.eglChooseConfig(d,attrs,C.byref(cfg),1,C.byref(n)) and n.value
E.eglCreateContext.restype=P;E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)]
ctx=E.eglCreateContext(d,cfg,None,(I*3)(0x3098,3,0x3038));assert ctx
E.eglCreatePbufferSurface.restype=P;E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)]
surf=E.eglCreatePbufferSurface(d,cfg,(I*5)(0x3057,320,0x3056,240,0x3038));assert surf
E.eglMakeCurrent.argtypes=[P,P,P,P];assert E.eglMakeCurrent(d,surf,surf,ctx)
getstr=fn('glGetString',C.c_char_p,[U]);print(getstr(0x1F02).decode(),getstr(0x1F01).decode())
source=(Path(__file__).resolve().parent.parent / 'map-heat.js').read_text()
shaders={k:v for k,v in re.findall(r'const (vertex|density|quad|color) = `([\s\S]*?)`;',source)}
create=fn('glCreateShader',U,[U]);ss=fn('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),P]);compile=fn('glCompileShader',None,[U]);get=fn('glGetShaderiv',None,[U,U,C.POINTER(I)]);log=fn('glGetShaderInfoLog',None,[U,I,P,C.c_char_p])
cp=fn('glCreateProgram',U,[]);attach=fn('glAttachShader',None,[U,U]);link=fn('glLinkProgram',None,[U]);getp=fn('glGetProgramiv',None,[U,U,C.POINTER(I)]);plog=fn('glGetProgramInfoLog',None,[U,I,P,C.c_char_p])
def make(v,f):
    p=cp()
    for typ,text in [(0x8B31,shaders[v]),(0x8B30,shaders[f])]:
        s=create(typ);blob=C.c_char_p(text.encode());ss(s,1,C.byref(blob),None);compile(s);ok=I();get(s,0x8B81,C.byref(ok))
        if not ok.value:
            out=C.create_string_buffer(8192);log(s,8192,None,out);raise Exception(out.value)
        attach(p,s)
    link(p);ok=I();getp(p,0x8B82,C.byref(ok))
    if not ok.value:
        out=C.create_string_buffer(8192);plog(p,8192,None,out);raise Exception(out.value)
    return p
p1=make('vertex','density');p2=make('quad','color');print('PASS: production density/color shader programs compile and link')
def gen(name):
    v=U();fn(name,None,[I,C.POINTER(U)])(1,C.byref(v));return v.value
tex=gen('glGenTextures');fn('glBindTexture',None,[U,U])(0x0DE1,tex)
param=fn('glTexParameteri',None,[U,U,I]);param(0x0DE1,0x2801,0x2601);param(0x0DE1,0x2800,0x2601)
image=fn('glTexImage2D',None,[U,I,I,I,I,I,U,U,P]);image(0x0DE1,0,0x8058,320,240,0,0x1908,0x1401,None)
fbo=gen('glGenFramebuffers');bf=fn('glBindFramebuffer',None,[U,U]);bf(0x8D40,fbo);fn('glFramebufferTexture2D',None,[U,U,U,U,I])(0x8D40,0x8CE0,0x0DE1,tex,0)
assert fn('glCheckFramebufferStatus',U,[U])(0x8D40)==0x8CD5
vao=gen('glGenVertexArrays');fn('glBindVertexArray',None,[U])(vao)
buf=gen('glGenBuffers');fn('glBindBuffer',None,[U,U])(0x8892,buf)
points=(F*6)(160,120,.85,210,140,.4);fn('glBufferData',None,[U,C.c_ssize_t,P,U])(0x8892,C.sizeof(points),points,0x88E8)
loc=fn('glGetAttribLocation',I,[U,C.c_char_p])(p1,b'a_point');fn('glEnableVertexAttribArray',None,[U])(loc);fn('glVertexAttribPointer',None,[U,I,U,U,I,P])(loc,3,0x1406,0,0,None)
use=fn('glUseProgram',None,[U]);use(p1)
ul=fn('glGetUniformLocation',I,[U,C.c_char_p]);fn('glUniform2f',None,[I,F,F])(ul(p1,b'u_size'),320,240);fn('glUniform1f',None,[I,F])(ul(p1,b'u_radius'),60)
fn('glViewport',None,[I,I,I,I])(0,0,320,240);fn('glClearColor',None,[F,F,F,F])(0,0,0,0);fn('glClear',None,[U])(0x4000)
fn('glEnable',None,[U])(0x0BE2);fn('glBlendFunc',None,[U,U])(1,1);draw=fn('glDrawArrays',None,[U,I,I]);draw(0,0,2);fn('glDisable',None,[U])(0x0BE2)
read=fn('glReadPixels',None,[I,I,I,I,U,U,P]);data=(C.c_ubyte*(320*240*4))();read(0,0,320,240,0x1908,0x1401,data);center=data[(120*320+160)*4];assert center>150;assert data[0]==0;print('PASS: density pixels are nonzero at session points, zero outside')
bf(0x8D40,0);use(p2);fn('glBindVertexArray',None,[U])(0);active=fn('glActiveTexture',None,[U]);active(0x84C0);fn('glBindTexture',None,[U,U])(0x0DE1,tex)
pal=gen('glGenTextures');active(0x84C1);fn('glBindTexture',None,[U,U])(0x0DE1,pal);param(0x0DE1,0x2801,0x2601);param(0x0DE1,0x2800,0x2601);palette=(C.c_ubyte*(256*4))(*[v for i in range(256) for v in (70,150+i//3,235,255)]);image(0x0DE1,0,0x8058,256,1,0,0x1908,0x1401,palette)
ui=fn('glUniform1i',None,[I,I]);ui(ul(p2,b'u_field'),0);ui(ul(p2,b'u_palette'),1);uf=fn('glUniform1f',None,[I,F]);uf(ul(p2,b'u_time'),0);uf(ul(p2,b'u_opacity'),1);draw(4,0,3);read(0,0,320,240,0x1908,0x1401,data)
assert data[(120*320+160)*4+3]>100;assert data[3]==0
err=fn('glGetError',U,[])();assert err==0,hex(err);print('PASS: color pass produces translucent heat only at data positions, no GL errors')
