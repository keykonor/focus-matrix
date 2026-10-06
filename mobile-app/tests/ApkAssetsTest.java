import com.focusmatrix.mobile.BundledPage;
import java.io.IOException;
import java.util.Enumeration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
public final class ApkAssetsTest {
 public static void main(String[] args) throws Exception {
  try(ZipFile apk=new ZipFile(args[0])){
   if(args.length>1&&"--expect-broken".equals(args[1])){
    if(apk.getEntry("assets/"+BundledPage.ENTRY)!=null)throw new AssertionError("Old APK unexpectedly has a readable homepage");
    System.out.println("Regression reproduced: old APK has no Android-readable homepage.");return;
   }
   Enumeration<? extends ZipEntry> entries=apk.entries();
   while(entries.hasMoreElements())if(entries.nextElement().getName().contains("\\"))throw new AssertionError("APK contains Windows separators");
   ZipEntry entry=apk.getEntry("assets/"+BundledPage.ENTRY);
   if(entry==null)throw new IOException("Missing bundled homepage");
   String html=BundledPage.read(apk.getInputStream(entry));
   if(!html.contains("id=\"root\""))throw new AssertionError("Missing React root");
   Matcher references=Pattern.compile("(?:src|href)=\"(/mobile/[^\"]+)\"").matcher(html);int count=0;
   while(references.find()){
    String asset="assets"+references.group(1);ZipEntry resource=apk.getEntry(asset);
    if(resource==null)throw new AssertionError("Missing referenced resource: "+asset);
    if(BundledPage.read(apk.getInputStream(resource)).isEmpty())throw new AssertionError("Empty bundled resource");count++;
   }
   if(count<2)throw new AssertionError("Expected JavaScript and CSS resources");
   System.out.println("APK offline assets: homepage and all "+count+" referenced resources read successfully.");
  }
 }
}
