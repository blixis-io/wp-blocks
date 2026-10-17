<?php
/** Template pack validation and schema tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Templates\TemplateValidator;
use Opis\JsonSchema\Validator as JsonSchemaValidator;
use PHPUnit\Framework\TestCase;
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- WordPress bootstrap constant for isolated tests.
}
require_once dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();

/** Security and schema contract for bundled packs. */
final class TemplateValidatorTest extends TestCase {
	/** Read a local fixture or fail the test.
	 *
	 * @param string $path Fixture path.
	 * @return string File content.
	 * @throws \RuntimeException When the fixture cannot be read.
	 */
	private static function read_file( string $path ): string {
		$content = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read local test fixtures.
		if ( false === $content ) {
			throw new \RuntimeException( 'Fixture could not be read.' ); }
		return $content;
	}
	/** Return the bundled pack directory. */
	private function packs(): string {
		return dirname( __DIR__ ) . '/templates/packs'; }
	/** Check all owner packs against both validators. */
	public function test_all_bundled_packs_pass_validator_and_schema(): void {
		$schema           = json_decode( self::read_file( dirname( __DIR__ ) . '/templates/schema/template.schema.json' ) );
		$schema_validator = new JsonSchemaValidator();
		$directories      = glob( $this->packs() . '/*', GLOB_ONLYDIR );
		$this->assertNotFalse( $directories );
		foreach ( $directories as $dir ) {
			$data = json_decode( self::read_file( $dir . '/template.json' ) );
			$this->assertTrue( $schema_validator->validate( $data, $schema )->isValid(), basename( $dir ) );
			$this->assertSame( [], ( new TemplateValidator() )->validate( $dir ), basename( $dir ) );}
	}
	/** Reject hostile paths, flags, content and unknown schema fields. */
	public function test_rejects_hostile_asset_paths_flags_documents_and_unknown_keys(): void {
		$source = $this->packs() . '/business';
		$tmp    = sys_get_temp_dir() . '/blx-template-hostile-' . bin2hex( random_bytes( 4 ) );
		mkdir( $tmp );
		mkdir( $tmp . '/assets' );
		mkdir( $tmp . '/assets/business' );
		$source_assets = glob( $source . '/assets/business/*' );
		$this->assertNotFalse( $source_assets );
		foreach ( $source_assets as $asset ) {
			copy( $asset, $tmp . '/assets/business/' . basename( $asset ) ); }
		$data = json_decode( self::read_file( $source . '/template.json' ), true );
		file_put_contents( $tmp . '/template.json', json_encode( $data ) );
		$this->assertSame( [], ( new TemplateValidator() )->validate( $tmp ) );
		$check     = function ( $mutate ) use ( $source, $tmp ) {
			$data = json_decode( self::read_file( $source . '/template.json' ), true );
			$mutate( $data );
			file_put_contents( $tmp . '/template.json', json_encode( $data ) );
			return ( new TemplateValidator() )->validate( $tmp );
		};
		$traversal = static function ( &$d ): void {
			$d['assets']['hero']['source']['path'] = '../../secret.webp';
		};
		$remote    = static function ( &$d ): void {
			$d['assets']['hero']['source']['path'] = 'https://evil.test/a.webp';
		};
		$scripts   = static function ( &$d ): void {
			$d['security']['allowRemoteScripts'] = true;
		};
		$unknown   = static function ( &$d ): void {
			$d['unexpected'] = true;
		};
		$color     = static function ( &$d ): void {
			$d['designTokens']['colors']['light']['primary'] = 'red';
		};
		$font      = static function ( &$d ): void {
			$d['fonts'][0]['family'] = 'Unknown Font';
		};
		$locale    = static function ( &$d ): void {
			$d['localizations']['fr'] = [];
		};
		$this->assertStringContainsString( 'unsafe path', implode( ' ', $check( $traversal ) ) );
		$this->assertStringContainsString( 'unsafe path', implode( ' ', $check( $remote ) ) );
		$this->assertStringContainsString( 'security', implode( ' ', $check( $scripts ) ) );
		$this->assertStringContainsString( 'unknown', implode( ' ', $check( $unknown ) ) );
		$this->assertStringContainsString( '#RRGGBB', implode( ' ', $check( $color ) ) );
		$this->assertStringContainsString( 'not bundled', implode( ' ', $check( $font ) ) );
		$this->assertStringContainsString( 'not a declared locale', implode( ' ', $check( $locale ) ) );
		$mutations = [
			'template name markup'        => static function ( &$d ) {
				$d['template']['name'] = '<img src=x onerror=alert(1)>'; },
			'category array markup'       => static function ( &$d ) {
				$d['template']['category'] = [ '<script>' ]; },
			'localization markup and URL' => static function ( &$d ) {
				$d['localizations']['en'] = [
					'x'    => '<script>alert(1)</script>',
					'href' => 'javascript:alert(1)',
				]; },
			'root remote CSS'             => static function ( &$d ) {
				$d['documents'][0]['root']['styles'] = [ 'background' => 'url(https://evil.test/t.png)' ]; },
			'root JavaScript animation'   => static function ( &$d ) {
				$d['documents'][0]['root']['animations'] = [ 'javascript:alert(1)' ]; },
			'document title markup'       => static function ( &$d ) {
				$d['documents'][0]['title'] = '<svg onload=alert(1)>'; },
			'asset alt markup'            => static function ( &$d ) {
				$d['assets']['logo']['alt'] = '<img onerror=alert(1)>'; },
			'bundled asset download URL'  => static function ( &$d ) {
				$d['importOptions']['downloadAssets'] = 'https://evil.test'; },
			'unknown URL prop poster'     => static function ( &$d ) {
				$d['documents'][0]['root']['props']['poster'] = 'https://evil.test/a.png'; },
		];
		foreach ( $mutations as $label => $mutation ) {
			$this->assertNotSame( [], $check( $mutation ), $label ); }
		$logo          = $tmp . '/assets/business/logo.svg';
		$original_logo = self::read_file( $logo );
		foreach ( [
			'protocol-relative href'  => '<svg xmlns="http://www.w3.org/2000/svg"><use href="//evil.test/x"/></svg>',
			'entity-encoded href'     => '<svg xmlns="http://www.w3.org/2000/svg"><use href="&#x2f;&#x2f;evil.test"/></svg>',
			'animate href'            => '<svg xmlns="http://www.w3.org/2000/svg"><animate href="https://evil.test"/></svg>',
			'set href'                => '<svg xmlns="http://www.w3.org/2000/svg"><set href="https://evil.test"/></svg>',
			'style import'            => '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.test/x)</style></svg>',
			'entity declaration'      => '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://evil.test">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
			'CSS URL style attribute' => '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://evil.test/x)"/></svg>',
		] as $label => $svg ) {
			file_put_contents( $logo, $svg );
			$this->assertNotSame( [], ( new TemplateValidator() )->validate( $tmp ), $label );
		}
		file_put_contents( $logo, $original_logo );
		$this->assertStringContainsString(
			'raw HTML',
			implode(
				' ',
				$check(
					function ( &$d ) {
						$d['documents'][0]['root']['props']['content'] = '<iframe src="x"></iframe>';
					}
				)
			)
		);
		$oversized = static function ( &$d ): void {
			$d['template']['name'] = str_repeat( 'x', 101 );
		};
		$this->assertStringContainsString( 'exceeds 100 characters', implode( ' ', $check( $oversized ) ) );
		foreach ( new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $tmp, \FilesystemIterator::SKIP_DOTS ), \RecursiveIteratorIterator::CHILD_FIRST ) as $item ) {
			$item->isDir() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() );
		} rmdir( $tmp );
	}
}
