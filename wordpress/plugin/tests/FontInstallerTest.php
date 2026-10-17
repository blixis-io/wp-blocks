<?php
/** Font installer behavior tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Templates\FontInstaller;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
/** Installer security and idempotence contract. */
final class FontInstallerTest extends TestCase {
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Check slug, capabilities, file copy and idempotence. */
	public function test_allowlist_capabilities_installation_and_idempotence(): void {
		$dir = sys_get_temp_dir() . '/blx-font-' . bin2hex( random_bytes( 4 ) );
		mkdir( $dir );
		$GLOBALS['blixis_font_test_dir']     = $dir;
		$GLOBALS['blixis_font_test_posts']   = [];
		$GLOBALS['blixis_font_test_allowed'] = false;
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Define WordPress functions in this isolated test process only.
		eval( 'function current_user_can($cap) { return $GLOBALS["blixis_font_test_allowed"]; } function get_posts($args) { return array_values(array_filter($GLOBALS["blixis_font_test_posts"], function($p) use($args) { return $p->post_type === $args["post_type"] && (!isset($args["name"]) || $p->post_name === $args["name"]); })); } function wp_get_allowed_font_mime_types() { return ["ttf"=>"font/ttf"]; } function wp_check_filetype($name,$mimes=[]) { return isset($mimes["ttf"]) ? ["type"=>"font/ttf"] : ["type"=>false]; } function wp_get_font_dir() { return ["path"=>$GLOBALS["blixis_font_test_dir"],"url"=>"https://example.test/fonts"]; } function wp_mkdir_p($p) { return is_dir($p) || mkdir($p,0777,true); } function trailingslashit($p) { return rtrim($p,"/")."/"; } function wp_unique_filename($p,$n) { if (!file_exists($p."/".$n)) return $n; $i=1; do { $candidate=pathinfo($n,PATHINFO_FILENAME)."-".$i++.".".pathinfo($n,PATHINFO_EXTENSION); } while(file_exists($p."/".$candidate)); return $candidate; } function wp_json_encode($d) { return json_encode($d); } function is_wp_error($v) { return false; } function wp_insert_post($d,$e=false) { $id=count($GLOBALS["blixis_font_test_posts"])+1; $p=(object)(["ID"=>$id,"post_type"=>$d["post_type"],"post_name"=>$d["post_name"]??"","post_title"=>$d["post_title"]??""]+$d); $GLOBALS["blixis_font_test_posts"][]=$p; return $id; } function wp_delete_post($id,$force=false) { return true; } function wp_delete_file($path) { return unlink($path); } function update_post_meta($id,$key,$value) { return true; }' );
		$installer = new FontInstaller();
		$this->assertFalse( $installer->install( '../inter' )->success );
		$this->assertFalse( $installer->install( 'inter' )->success );
		$GLOBALS['blixis_font_test_allowed'] = true;
		$occupied                            = $dir . '/Inter-opsz-wght.ttf';
		file_put_contents( $occupied, 'keep-me' );
		$first = $installer->install( 'inter' );
		$again = $installer->install( 'inter' );
		$this->assertTrue( $first->success );
		$this->assertSame( $first->family_id, $again->family_id );
		$this->assertCount( 2, $GLOBALS['blixis_font_test_posts'] );
		$font_files = glob( $dir . '/*.ttf' );
		$this->assertNotFalse( $font_files );
		$this->assertCount( 2, $font_files );
		$this->assertSame( 'keep-me', file_get_contents( $occupied ) );
		$files = glob( $dir . '/*' );
		$this->assertNotFalse( $files );
		foreach ( $files as $file ) {
			unlink( $file );
		} rmdir( $dir );
	}
}
