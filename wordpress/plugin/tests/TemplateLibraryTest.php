<?php
/** Template library resilience tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Templates\Library;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();
/** Library behavior with valid and invalid pack roots. */
final class TemplateLibraryTest extends TestCase {
	/** Copy a local template fixture tree for isolated filtered-root tests.
	 *
	 * @param string $source Fixture source directory.
	 * @param string $destination Destination directory.
	 */
	private function copy_tree( string $source, string $destination ): void {
		mkdir( $destination, 0777, true );
		foreach ( new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $source, \FilesystemIterator::SKIP_DOTS ), \RecursiveIteratorIterator::SELF_FIRST ) as $item ) {
			$target = $destination . '/' . substr( $item->getPathname(), strlen( $source ) + 1 );
			$item->isDir() ? mkdir( $target, 0777, true ) : copy( $item->getPathname(), $target );
		}
	}
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Load valid cards and report invalid packs without throwing. */
	public function test_loads_cards_and_skips_invalid_pack_without_throwing(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Define WordPress functions in this isolated test process only.
		eval( 'function plugins_url($path, $plugin = "") { return "https://example.test/plugin/" . $path; } function get_posts($args = []) { return []; }' );
		$root = sys_get_temp_dir() . '/blx-library-' . bin2hex( random_bytes( 4 ) );
		mkdir( $root );
		mkdir( $root . '/invalid' );
		file_put_contents( $root . '/invalid/template.json', '{bad' );
		$library = Library::from_directories( [ dirname( __DIR__ ) . '/templates/packs',$root ] );
		$this->assertCount( 4, $library->all() );
		$card = $library->find( 'business' );
		$this->assertNotNull( $card, (string) json_encode( $library->problems() ) );
		$this->assertSame( 'business', $card->data['id'] );
		$this->assertStringContainsString( 'https://example.test/plugin/', $card->data['previewUrl'] );
		$this->assertSame( 'invalid', $library->problems()[0]['id'] );
		unlink( $root . '/invalid/template.json' );
		rmdir( $root . '/invalid' );
		rmdir( $root );
	}
	#[RunInSeparateProcess]
	#[PreserveGlobalState( false )]
	/** Filtered packs read tokens and assets from the validated upload root and report duplicates. */
	public function test_filtered_pack_uses_validated_root_and_reports_duplicate_id(): void {
		// phpcs:ignore Squiz.PHP.Eval.Discouraged -- Isolated WordPress URL and query stubs.
		eval( 'namespace { $GLOBALS["blixis_upload_base"]=""; function plugins_url($path,$plugin="") { return "https://example.test/plugin/".$path; } function wp_upload_dir() { return ["basedir"=>$GLOBALS["blixis_upload_base"],"baseurl"=>"https://example.test/uploads"]; } function get_posts($args=[]) { return []; } }' );
		$root                          = sys_get_temp_dir() . '/blx-filtered-' . bin2hex( random_bytes( 4 ) );
		$uploads                       = $root . '/uploads';
		$GLOBALS['blixis_upload_base'] = $uploads;
		$first                         = $uploads . '/packs/business';
		$second                        = $root . '/second/business';
		$outside_pack                  = $root . '/second/creative-agency';
		$this->copy_tree( dirname( __DIR__ ) . '/templates/packs/business', $first );
		$this->copy_tree( dirname( __DIR__ ) . '/templates/packs/business', $second );
		$this->copy_tree( dirname( __DIR__ ) . '/templates/packs/creative-agency', $outside_pack );
		$data = json_decode( (string) file_get_contents( $first . '/template.json' ), true );
		$data['designTokens']['colors']['light']['primary'] = '#123456';
		file_put_contents( $first . '/template.json', json_encode( $data ) );
		$library = Library::from_directories( [ $uploads . '/packs', $root . '/second' ] );
		$card    = $library->find( 'business' );
		$this->assertNotNull( $card, (string) json_encode( $library->problems() ) );
		$this->assertStringContainsString( 'https://example.test/uploads/packs/business/assets/business/preview.webp', $card->data['previewUrl'] );
		$tokens = $library->tokens( 'business' );
		$this->assertNotNull( $tokens );
		$this->assertSame( '#123456', $tokens['colors']['light']['primary'] );
		$this->assertSame( 'duplicate template id; first valid pack wins', $library->problems()[0]['errors'][0] );
		$outside_card = $library->find( 'creative-agency' );
		$this->assertNotNull( $outside_card );
		$this->assertSame( '', $outside_card->data['previewUrl'] );
		$this->assertStringContainsString( 'pack root is outside plugin and uploads directories; asset URLs are unavailable', (string) json_encode( $library->problems() ) );
		foreach ( new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $root, \FilesystemIterator::SKIP_DOTS ), \RecursiveIteratorIterator::CHILD_FIRST ) as $item ) {
			$item->isDir() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() );
		}
		rmdir( $root );
	}
}
