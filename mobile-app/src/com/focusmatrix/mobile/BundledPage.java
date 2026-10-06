package com.focusmatrix.mobile;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Used by the app and the APK regression test; no network is involved. */
public final class BundledPage {
 public static final String ENTRY="mobile/index.html";
 private BundledPage() {}
 public static String read(InputStream input) throws IOException {
  try(InputStream stream=input;ByteArrayOutputStream output=new ByteArrayOutputStream()){
   byte[] buffer=new byte[8192];int count;
   while((count=stream.read(buffer))!=-1)output.write(buffer,0,count);
   return new String(output.toByteArray(),StandardCharsets.UTF_8);
  }
 }
}
