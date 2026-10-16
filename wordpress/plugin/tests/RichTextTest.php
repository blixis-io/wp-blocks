<?php
/** Rich text validation and rendering security tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Render\RichText;
use Blixis\Builder\Render\ContentResolver;
use Blixis\Builder\Registry\ElementRegistry;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
\Blixis\Builder\Autoloader::register();

/** Pure PHP rich text contract tests; no WordPress boot is required. */
final class RichTextTest extends TestCase {
	/** Checks escaped text and fixed semantic markup. */
	public function test_safe_rendering_and_fixed_markup(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"<script>&","m":["strong",{"link":{"href":"https://example.test","newTab":true}},{"style":{"color":"color-primary","weight":"bold"}}]},{"t":"br"}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertTrue( RichText::valid( $value ) );
		$this->assertSame( '<a href="https://example.test" target="_blank" rel="noopener noreferrer"><strong><span class="blx-mc-color-primary blx-mw-bold">&lt;script&gt;&amp;</span></strong></a><br>', RichText::render( $value ) );
	}

	/** Button labels do not nest links. */
	public function test_button_label_ignores_link_mark(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"Button","m":[{"link":{"href":"javascript:alert(1)"}},"em"]}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertFalse( RichText::valid( $value ) );
		$this->assertSame( 'Button', RichText::render( $value, false ) );
	}

	/** A valid link mark is omitted in a Button label while text and other marks survive. */
	public function test_button_label_suppresses_valid_link(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"Button","m":[{"link":{"href":"https://example.test"}},"em"]}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertTrue( RichText::valid( $value ) );
		$this->assertSame( '<em>Button</em>', RichText::render( $value, false ) );
	}

	/** Semantic tags are nested in a fixed order regardless of input mark order. */
	public function test_semantic_mark_order_is_fixed(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"x","m":["code","u","em","s","strong"]}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertSame( '<strong><em><u><s><code>x</code></s></u></em></strong>', RichText::render( $value ) );
	}

	/** Token-mark validation rejects ids absent from the supplied active token set. */
	public function test_unknown_token_id_is_rejected_when_tokens_are_known(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"x","m":[{"style":{"color":"color-primary"}}]}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertFalse( RichText::valid( $value, [ 'color-secondary' ] ) );
		$this->assertTrue( RichText::valid( $value, [ 'color-primary' ] ) );
	}

	/** A render context's active token set omits unknown style marks completely. */
	public function test_unknown_token_marks_are_omitted_during_render(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"plain","m":[{"style":{"color":"color-missing"}}]}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertSame( '<span class="blx-mc-color-missing">plain</span>', RichText::render( $value ) );
		$this->assertSame( 'plain', RichText::render_validated( $value, true, [ 'color-active' ] ) );
		$this->assertSame( 'plain', RichText::render_validated( $value, true, [] ) );
	}

	/** Invalid content degrades to escaped text. */
	public function test_invalid_values_degrade_to_escaped_plain_text(): void {
		$value = \json_decode( '{"v":1,"inline":[{"t":"text","s":"<img src=x onerror=alert(1)>"},{"t":"script","s":"bad"}]}' );
		$this->assertInstanceOf( \stdClass::class, $value );
		$this->assertFalse( RichText::valid( $value ) );
		$this->assertSame( '&lt;img src=x onerror=alert(1)&gt;', RichText::render( $value ) );
	}

	/** Checks limits and a 100-case adversarial mark set. */
	public function test_limits_and_adversarial_mark_matrix(): void {
		$exact = (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => \str_repeat( 'x', RichText::MAX_CHARACTERS ),
				],
			],
		];
		$over  = (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => \str_repeat( 'x', RichText::MAX_CHARACTERS + 1 ),
				],
			],
		];
		$this->assertTrue( RichText::valid( $exact ) );
		$this->assertFalse( RichText::valid( $over ) );
		$marks = (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => 'x',
					'm' => \array_fill( 0, 10000, 'strong' ),
				],
			],
		];
		$this->assertFalse( RichText::valid( $marks ) );
		$href = static fn ( int $length ): \stdClass => (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => 'x',
					'm' => [ (object) [ 'link' => (object) [ 'href' => '/' . \str_repeat( 'a', $length ) ] ] ],
				],
			],
		];
		$this->assertTrue( RichText::valid( $href( RichText::MAX_HREF - 1 ) ) );
		$this->assertFalse( RichText::valid( $href( RichText::MAX_HREF ) ) );
	}

	/** Consumes the shared cross-language fixture corpus. */
	public function test_shared_fixture_corpus(): void {
		$file = \dirname( __DIR__, 3 ) . '/tests/fixtures/rich-text/cases.json';
		$data = \json_decode( (string) \file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local fixture file.
		$this->assertInstanceOf( \stdClass::class, $data );
		foreach ( $data->valid as $case ) {
			$case_data = \get_object_vars( $case );
			$case_id   = (string) ( $case_data['id'] ?? 'unknown' );
			$value     = $case_data['value'] ?? null;
			$this->assertTrue( RichText::valid( $value ), $case_id );
			if ( isset( $case_data['php_raw_value'] ) && \is_string( $case_data['php_raw_value'] ) ) {
				$this->assertTrue( RichText::valid( \json_decode( $case_data['php_raw_value'] ) ), $case_id . ' raw JSON' );
			}
			if ( isset( $case_data['html'] ) && \is_string( $case_data['html'] ) ) {
				$this->assertSame( $case_data['html'], RichText::render( $value ), $case_id );
			}
		}
		foreach ( $data->invalid as $case ) {
			$case_data = \get_object_vars( $case );
			$this->assertFalse( RichText::valid( $case_data['value'] ?? null ), (string) ( $case_data['id'] ?? 'unknown' ) );
			if ( isset( $case_data['raw_invalid_json'] ) && \is_string( $case_data['raw_invalid_json'] ) ) {
				$this->assertFalse( RichText::valid( \json_decode( $case_data['raw_invalid_json'] ) ), (string) ( $case_data['id'] ?? 'unknown' ) . ' raw JSON' );
			}
		}
		foreach ( $data->url_cases as $case ) {
			$this->assertSame( $case->safe, \Blixis\Builder\Registry\SafeUrl::accepts( $case->value ), $case->value );
		}
	}

	/** Rendering the largest allowed rich value stays within a generous test deadline. */
	public function test_large_value_rendering_is_bounded(): void {
		$value = (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => \str_repeat( 'x', RichText::MAX_CHARACTERS ),
				],
			],
		];
		$start = \microtime( true );
		$this->assertTrue( RichText::valid( $value ) );
		$this->assertSame( RichText::MAX_CHARACTERS, \strlen( RichText::render_validated( $value ) ) );
		$this->assertLessThan( 5.0, \microtime( true ) - $start );
	}

	/** Invalid rich property values degrade within the definition's UTF-8 character limit and keep locale fallback. */
	public function test_content_resolver_bounds_degraded_text_and_preserves_fallback(): void {
		$registry = ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' );
		$node     = (object) [
			'id'    => 'btn-1',
			'type'  => 'blixis/button',
			'props' => (object) [],
		];
		$rich     = (object) [
			'v'      => 1,
			'inline' => [
				(object) [
					't' => 'text',
					's' => \str_repeat( 'é', 120 ),
				],
			],
		];
		$oversize = (object) [
			'defaultLocale' => 'en_US',
			'translations'  => (object) [ 'en_US' => (object) [ 'btn-1' => (object) [ 'values' => (object) [ 'label' => $rich ] ] ] ],
		];
		$values   = ( new ContentResolver( $registry ) )->values( $node, $oversize, 'en_US' );
		$this->assertSame( \str_repeat( 'é', 100 ), $values['label'] );
		$fallback = (object) [
			'defaultLocale' => 'en_US',
			'translations'  => (object) [
				'nl_NL' => (object) [ 'btn-1' => (object) [ 'values' => (object) [ 'label' => $rich ] ] ],
				'en_US' => (object) [ 'btn-1' => (object) [ 'values' => (object) [ 'label' => 'Fallback' ] ] ],
			],
		];
		$this->assertSame( 'Fallback', ( new ContentResolver( $registry ) )->values( $node, $fallback, 'nl_NL' )['label'] );
	}
}
