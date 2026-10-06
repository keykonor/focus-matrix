package com.focusmatrix.mobile;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowInsets;
import android.webkit.*;
import android.net.http.SslError;
import android.widget.Toast;
import java.io.*;
import java.util.*;
public final class MainActivity extends Activity {
 private static final String HOST="focus-matrix-plans-17154.just-bard-2476.chatgpt.site";
 private static final String ORIGIN="https://"+HOST;
 private WebView web;
 private boolean trusted(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
 @Override public void onCreate(Bundle saved){super.onCreate(saved);web=new WebView(this);web.setBackgroundColor(Color.rgb(244,250,248));setContentView(web);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setUserAgentString(settings.getUserAgentString()+" FocusMatrixAndroid/1.0");settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);WebView.setWebContentsDebuggingEnabled(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebChromeClient(new WebChromeClient());
  web.setWebViewClient(new WebViewClient(){
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();}
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(trusted(uri)&&!uri.getPath().startsWith("/downloads/"))return false;if("https".equals(uri.getScheme())||"http".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){Toast.makeText(MainActivity.this,"无法打开链接",Toast.LENGTH_SHORT).show();}}return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if(!trusted(uri)||!uri.getPath().startsWith("/mobile/"))return null;String path=uri.getPath().substring(1);if(path.contains("..")||path.contains("\\"))return missing();try{String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".webmanifest")?"application/manifest+json":"application/octet-stream";Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");headers.put("Referrer-Policy","no-referrer");return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open(path));}catch(IOException error){return missing();}}
  });
  web.setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener(){ public WindowInsets onApplyWindowInsets(android.view.View view,WindowInsets insets){if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}else{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());}return insets;}});
  if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,new android.window.OnBackInvokedCallback(){public void onBackInvoked(){back();}});
  loadLocalPage(getIntent());
 }
 private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private String startUrl(Intent intent){Uri uri=intent.getData();String result=ORIGIN+"/mobile/index.html";if(uri!=null&&trusted(uri)){String hash=uri.getFragment();if(hash!=null&&hash.matches("[a-f0-9]{64}"))return result+"#share="+hash;if(hash!=null&&hash.matches("(?:pair|share)=[a-f0-9]{64}"))return result+"#"+hash;}return result;}
 private void loadLocalPage(Intent intent){
  try {
   String html=BundledPage.read(getAssets().open(BundledPage.ENTRY));
   // Keep the existing HTTPS origin so IndexedDB contents survive this update.
   String url=startUrl(intent);
   web.loadDataWithBaseURL(url,html,"text/html","UTF-8",url);
  }catch(IOException error){
   android.widget.TextView message=new android.widget.TextView(this);
   message.setText("内置页面无法读取。请重新下载新版安装包并覆盖安装，保留原有应用数据。");
   message.setTextSize(18);message.setPadding(40,80,40,40);setContentView(message);
  }
 }
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);loadLocalPage(intent);}
 private void back(){if(web.canGoBack())web.goBack();else moveTaskToBack(true);}
 @Override public void onBackPressed(){back();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
 @Override protected void onDestroy(){if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}

