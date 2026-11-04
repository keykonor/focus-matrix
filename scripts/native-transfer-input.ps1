param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,UIAutomationClient,UIAutomationTypes
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class MatrixTransferInput {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls,string title);
 public static IntPtr Window(string title){return FindWindow(null,title);}
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd,ref Point p);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 public static Point ScreenPoint(IntPtr hwnd,double x,double y){var p=new Point{X=(int)Math.Round(x*GetDpiForWindow(hwnd)/96.0),Y=(int)Math.Round(y*GetDpiForWindow(hwnd)/96.0)};ClientToScreen(hwnd,ref p);return p;}
 public static void Transfer(string title,double x,double y,string mode,string[] files,int sourceX,int sourceY) {
  var hwnd=FindWindow(null,title);if(hwnd==IntPtr.Zero)throw new Exception("Isolated test window missing");
  var point=new Point{X=(int)Math.Round(x*GetDpiForWindow(hwnd)/96.0),Y=(int)Math.Round(y*GetDpiForWindow(hwnd)/96.0)};ClientToScreen(hwnd,ref point);
  Console.WriteLine("physical drag "+sourceX+","+sourceY+" -> "+point.X+","+point.Y);
  if(mode=="paste") {
   SetForegroundWindow(hwnd);var original=Clipboard.GetDataObject();
   try {var list=new System.Collections.Specialized.StringCollection();list.AddRange(files);Clipboard.SetFileDropList(list);SendKeys.SendWait("^v");System.Threading.Thread.Sleep(500);}
   finally {if(original!=null)Clipboard.SetDataObject(original,true);else Clipboard.Clear();}return;
  }
  Point cursor;GetCursorPos(out cursor);
  try {
   SetCursorPos(sourceX,sourceY);mouse_event(2,0,0,0,UIntPtr.Zero);System.Threading.Thread.Sleep(200);
   for(int step=1;step<=20;step++){SetCursorPos(sourceX+(point.X-sourceX)*step/20,sourceY+(point.Y-sourceY)*step/20);System.Threading.Thread.Sleep(35);}
   System.Threading.Thread.Sleep(400);mouse_event(4,0,0,0,UIntPtr.Zero);System.Threading.Thread.Sleep(500);
  } finally {mouse_event(4,0,0,0,UIntPtr.Zero);SetCursorPos(cursor.X,cursor.Y);}
 }
}
'@
$value=Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
[MatrixTransferInput]::SetProcessDPIAware() | Out-Null
if($value.mode -eq 'paste'){[MatrixTransferInput]::Transfer($value.title,$value.x,$value.y,'paste',[string[]]$value.files,0,0);exit}
if($value.mode -eq 'text'){
 $handle=[MatrixTransferInput]::Window($value.title)
 [MatrixTransferInput]::SetWindowPos($handle,[IntPtr](-1),0,0,0,0,0x13) | Out-Null
 [MatrixTransferInput]::SetForegroundWindow($handle) | Out-Null
 $point=[MatrixTransferInput]::ScreenPoint($handle,$value.sourceX,$value.sourceY)
 [MatrixTransferInput]::Transfer($value.title,$value.x,$value.y,'text',@(),$point.X,$point.Y);exit
}
if(@($value.files).Count -eq 0){throw 'Explorer input needs synthetic files.'}
$folder=Split-Path -Parent $value.files[0]
$shell=New-Object -ComObject Shell.Application
$existing=@($shell.Windows()) | Where-Object {try{$_.Document.Folder.Self.Path -eq $folder}catch{$false}}
Start-Process explorer.exe -ArgumentList ('/select,"'+$value.files[0]+'"')
$explorerWindow=$null
try {
 for($attempt=0;$attempt -lt 100;$attempt++){
  $explorerWindow=@($shell.Windows()) | Where-Object {try{$_.Document.Folder.Self.Path -eq $folder}catch{$false}} | Select-Object -First 1
  if($explorerWindow){break};Start-Sleep -Milliseconds 100
 }
 if(-not $explorerWindow){throw 'Synthetic Explorer window did not open.'}
 $handle=[IntPtr][long]$explorerWindow.HWND;$appHandle=[MatrixTransferInput]::Window($value.title)
 $screen=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
 $appPhysicalWidth=[int](1000*[MatrixTransferInput]::GetDpiForWindow($appHandle)/96)+24
 [MatrixTransferInput]::SetWindowPos($appHandle,[IntPtr](-1),$screen.Right-$appPhysicalWidth,50,0,0,0x11) | Out-Null
 [MatrixTransferInput]::SetForegroundWindow($appHandle) | Out-Null
 [MatrixTransferInput]::SetWindowPos($handle,[IntPtr](-1),$screen.Left+10,100,650,650,0) | Out-Null
 [MatrixTransferInput]::SetForegroundWindow($handle) | Out-Null
 Start-Sleep -Milliseconds 500
 $first=$true
 foreach($file in $value.files){$item=$explorerWindow.Document.Folder.ParseName((Split-Path -Leaf $file));$explorerWindow.Document.SelectItem($item,$(if($first){29}else{1}));$first=$false}
 Start-Sleep -Milliseconds 300
 $automation=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
 $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem)
 $items=$automation.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
 $name=[IO.Path]::GetFileNameWithoutExtension($value.files[0]);$sourceItem=$null
 foreach($item in $items){if($item.Current.Name -eq (Split-Path -Leaf $value.files[0]) -or $item.Current.Name -eq $name){$sourceItem=$item;break}}
 if(-not $sourceItem){throw 'Synthetic file item not found in Explorer.'}
 $rect=$sourceItem.Current.BoundingRectangle
 [MatrixTransferInput]::Transfer($value.title,$value.x,$value.y,'drop',[string[]]$value.files,[int]($rect.Left+25),[int]($rect.Top+$rect.Height/2))
 Write-Output 'Explorer drag completed'
}finally{if($explorerWindow){if($existing.Count -eq 0){$explorerWindow.Quit()}else{[MatrixTransferInput]::SetWindowPos([IntPtr][long]$explorerWindow.HWND,[IntPtr](-2),0,0,0,0,0x13) | Out-Null}}}
