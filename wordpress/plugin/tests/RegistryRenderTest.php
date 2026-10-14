<?php
/** Core registry and render contract tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Registry\DocumentChecker;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Registry\SafeUrl;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Golden and negative cases for BWB-043. */
final class RegistryRenderTest extends TestCase {
	/**
	 * Apply the documented contract.
	 */
	private static function registry(): ElementRegistry {
		return ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' );
	}

	/**
	 * Apply the documented contract.
	 */
	public function test_nesting_categories_and_unknown_relocation(): void {
		$registry = self::registry();
		$this->assertTrue( $registry->can_nest( null, 'blixis/section' ) );
		$this->assertTrue( $registry->can_nest( 'blixis/section', 'blixis/heading' ) );
		$this->assertFalse( $registry->can_nest( null, 'blixis/heading' ) );
		$this->assertFalse( $registry->can_nest( 'blixis/heading', 'blixis/text' ) );
		$this->assertFalse( $registry->can_nest( 'vendor/missing', 'blixis/text' ) );
		$this->assertTrue( $registry->can_nest( 'blixis/container', 'vendor/missing', 'relocate' ) );
	}

	/**
	 * Apply the documented contract.
	 */
	public function test_manifest_rejects_unknown_kind_and_fields(): void {
		$manifest = \json_decode( (string) \file_get_contents( \dirname( __DIR__ ) . '/data/core-elements.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
		$manifest['elements'][0]['props']['href']['kind'] = 'html';
		$this->expectException( \InvalidArgumentException::class );
		ElementRegistry::from_array( $manifest );
	}

	/**
	 * Apply the documented contract.
	 */
	public function test_url_rejects_obfuscation(): void {
		foreach ( [ 'javascript:x', 'data:x', '//evil.test', 'java%0ascript:x', "java\tscript:x", 'java&#58;script:x', 'x\\y', 'x y' ] as $url ) {
			$this->assertFalse( SafeUrl::accepts( $url ), $url );
		}
		foreach ( [ '', '/path', '#id', 'mailto:hi@example.test', 'https://example.test' ] as $url ) {
			$this->assertTrue( SafeUrl::accepts( $url ), $url );
		}
	}

	/** Every registry issue rule has an independent negative case. */
	public function test_checker_registry_rules(): void {
		$base    = [
			'root'          => [
				(object) [
					'id'       => 'section',
					'type'     => 'blixis/section',
					'props'    => (object) [],
					'children' => [
						(object) [
							'id'       => 'heading',
							'type'     => 'blixis/heading',
							'props'    => (object) [ 'level' => 2 ],
							'children' => [],
						],
					],
				],
			],
			'defaultLocale' => 'en_US',
			'locales'       => [ 'en_US' ],
			'translations'  => (object) [
				'en_US' => (object) [
					'heading' => (object) [
						'status' => 'translated',
						'values' => (object) [ 'text' => 'Hi' ],
					],
				],
			],
		];
		$cases   = [
			'unknown-element-type'           => static function ( $doc ): void {
				$doc->root[0]->children[0]->type = 'vendor/missing'; },
			'invalid-nesting'                => static function ( $doc ): void {
				$doc->root = [ $doc->root[0]->children[0] ]; },
			'unknown-property'               => static function ( $doc ): void {
				$doc->root[0]->children[0]->props->extra = 1; },
			'translatable-property-in-props' => static function ( $doc ): void {
				$doc->root[0]->children[0]->props->text = 'wrong stream'; },
			'missing-required-property'      => static function ( $doc ): void {
				$doc->root[0]->children[0]->props = (object) []; },
			'invalid-property-value'         => static function ( $doc ): void {
				$doc->root[0]->children[0]->props->level = 7; },
			'untranslatable-property'        => static function ( $doc ): void {
				$doc->translations->en_US->heading->values->level = 2; },
			'invalid-translation-value'      => static function ( $doc ): void {
				$doc->translations->en_US->heading->values->text = \str_repeat( 'x', 501 ); },
			'duplicate-element-id'           => static function ( $doc ): void {
				$doc->root[0]->children[0]->id = 'section'; },
		];
		$checker = new DocumentChecker( self::registry() );
		foreach ( $cases as $code => $change ) {
			$doc = \json_decode( (string) \json_encode( $base ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Isolated test copy.
			$change( $doc );
			$issues = $checker->check( $doc );
			$this->assertContains( $code, \array_column( $issues, 'code' ), $code );
			if ( 'unknown-element-type' === $code ) {
				$this->assertSame( 'warning', $issues[0]['severity'] );
			}
		}
	}

	/** Every property kind applies its own value rule. */
	public function test_property_kind_values(): void {
		$registry = self::registry();
		$cases    = [
			[ 'blixis/heading', 'level', 0 ],
			[ 'blixis/heading', 'level', '2' ],
			[ 'blixis/section', 'tag', 'script' ],
			[ 'blixis/container', 'maxWidth', 'huge' ],
			[ 'blixis/image', 'attachmentId', 0 ],
			[ 'blixis/image', 'decorative', 'true' ],
			[ 'blixis/button', 'href', 'javascript:x' ],
			[ 'blixis/text', 'text', \str_repeat( 'x', 5001 ) ],
		];
		foreach ( $cases as [ $type, $property, $value ] ) {
			$definition = $registry->get( $type );
			$this->assertNotNull( $definition );
			$this->assertFalse( ElementRegistry::valid_value( $definition['props'][ $property ], $value ), $type . ':' . $property );
		}
	}

	/**
	 * Apply the documented contract.
	 */
	public function test_document_fixtures(): void {
		$checker = new DocumentChecker( self::registry() );
		$files   = \glob( \dirname( __DIR__, 3 ) . '/tests/fixtures/documents/{valid,invalid}/*.fixture.json', GLOB_BRACE );
		foreach ( false === $files ? [] : $files as $file ) {
			$fixture  = \json_decode( (string) \file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
			$issues   = $checker->check( $fixture->input );
			$expected = $fixture->expected->error ?? null;
			if ( null !== $expected && 'schema' !== $expected ) {
				$this->assertContains( $expected, \array_column( $issues, 'code' ), $file );
			} else {
				$this->assertNotContains( $expected, \array_column( $issues, 'code' ), $file );
			}
		}
	}

	/**
	 * Apply the documented contract.
	 */
	public function test_render_corpus(): void {
		$media    = new class() implements MediaResolver {
			/**
			 * Apply the documented contract.
			 *
			 * @param int $attachment_id Attachment id.
			 * @return array{url:string,width:int,height:int,alt:string}|null Resolved media.
			 */
			public function resolve( int $attachment_id ): ?array {
				return 7 === $attachment_id ? [
					'url'    => 'https://example.test/image.jpg',
					'width'  => 640,
					'height' => 480,
					'alt'    => 'Stored alt',
				] : null;
			}
		};
		$renderer = new CoreDocumentRenderer( self::registry(), $media );
		$files    = \glob( \dirname( __DIR__, 3 ) . '/tests/fixtures/render/*.fixture.json' );
		foreach ( false === $files ? [] : $files as $file ) {
			$fixture = \json_decode( (string) \file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
			$this->assertSame( $fixture->{'expectedHtml'}, $renderer->render( $fixture->document, $fixture->locale, $fixture->mode ), $file );
		}
	}
}
