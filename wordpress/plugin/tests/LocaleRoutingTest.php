<?php
/**
 * Locale routing tests (pure parts).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Locale\Alternates;
use Blixis\Builder\Locale\Collisions;
use Blixis\Builder\Locale\Direction;
use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Locale\RoutePath;
use Blixis\Builder\Locale\Switcher;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/LocaleRoutingStubs.php';

/** Prefix derivation, request splitting, URL localisation, route safety, direction and alternates. */
final class LocaleRoutingTest extends TestCase {
	/**
	 * A two-language configuration.
	 */
	private function config(): LocaleConfig {
		return LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'nl_NL' ],
				'fallback'       => 'blank',
			],
			'en_US'
		);
	}

	/** The option is parsed strictly; anything invalid is a single-language site. */
	public function test_config_parsing(): void {
		$config = $this->config();
		$this->assertSame( [ 'en_US', 'nl_NL' ], $config->enabled );
		$this->assertSame( 'blank', $config->fallback );
		$this->assertTrue( $config->is_multilingual() );
		foreach ( [ false, null, 'x', [], [ 'version' => 2 ], [ 'version' => '1' ] ] as $bad ) {
			$single = LocaleConfig::from_option( $bad, 'de_DE' );
			$this->assertSame( [ 'de_DE' ], $single->enabled, (string) \json_encode( $bad ) );
			$this->assertFalse( $single->is_multilingual() );
		}
		$messy = LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'nl_NL',
				'enabledLocales' => [ 'nl_NL', 'en_US', 'EN_us', '../x', 5, 'en_US', "fr_FR\n", 'fr_FR' ],
				'fallback'       => 'weird',
			],
			'en_US'
		);
		$this->assertSame( [ 'nl_NL', 'en_US', 'fr_FR' ], $messy->enabled );
		$this->assertSame( 'source', $messy->fallback );
		$many = LocaleConfig::from_option(
			[
				'version'        => 1,
				'enabledLocales' => \array_map( static fn ( int $n ): string => 'xx_' . \chr( 65 + $n % 26 ) . \chr( 65 + (int) ( $n / 26 ) ) . 'ab', \range( 0, 60 ) ),
			],
			'en_US'
		);
		$this->assertLessThanOrEqual( LocaleConfig::MAX_LOCALES, \count( $many->enabled ) );
	}

	/** The prefix is the language subtag unless two enabled locales share it. */
	public function test_prefixes(): void {
		$this->assertSame( [ 'nl_NL' => 'nl' ], $this->config()->prefixes() );
		$both = LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'nl_NL', 'nl_BE' ],
			],
			'en_US'
		);
		$this->assertSame(
			[
				'nl_NL' => 'nl-nl',
				'nl_BE' => 'nl-be',
			],
			$both->prefixes()
		);
		$this->assertSame( 'nl_BE', $both->locale_for_prefix( 'nl-be' ) );
		$this->assertNull( $both->locale_for_prefix( 'nl' ) );
		$this->assertSame( 'nl-NL', LocaleConfig::tag( 'nl_NL' ) );
	}

	/** Only a known first segment is a prefix; the rest of the path is preserved. */
	public function test_split(): void {
		$config = $this->config();
		$this->assertSame(
			[
				'locale' => 'nl_NL',
				'path'   => '/about/',
			],
			RoutePath::split( '/nl/about/', $config )
		);
		$this->assertSame(
			[
				'locale' => 'nl_NL',
				'path'   => '/',
			],
			RoutePath::split( '/nl/', $config )
		);
		$this->assertSame(
			[
				'locale' => 'nl_NL',
				'path'   => '/',
			],
			RoutePath::split( '/nl', $config )
		);
		foreach ( [ '/', '', 'nl/about', '/en/about/', '/NL/about/', '/nlx/', '/n/', '/about/nl/', '//nl/about', '/nl%2Fabout' ] as $path ) {
			$this->assertNull( RoutePath::split( $path, $config ), $path );
		}
	}

	/** Prefixes are added and the site's own sub-directory is respected. */
	public function test_add_and_home(): void {
		$this->assertSame( '/nl/', RoutePath::add( '/', 'nl' ) );
		$this->assertSame( '/nl/about/', RoutePath::add( '/about/', 'nl' ) );
		$this->assertSame( '/a/b', RoutePath::below_home( '/blog/a/b', '/blog' ) );
		$this->assertSame( '/', RoutePath::below_home( '/blog', '/blog/' ) );
		$this->assertNull( RoutePath::below_home( '/other/a', '/blog' ) );
		$this->assertNull( RoutePath::below_home( '/blogger/a', '/blog' ) );
		$this->assertSame( '/x', RoutePath::below_home( '/x', '' ) );
	}

	/** Generated site URLs move between locales without touching reserved, foreign or REST URLs. */
	public function test_localize_url(): void {
		$config = $this->config();
		$home   = 'https://example.test';
		$cases  = [
			[ 'https://example.test/about/', 'nl', 'https://example.test/nl/about/' ],
			[ 'https://example.test/', 'nl', 'https://example.test/nl/' ],
			[ 'https://example.test', 'nl', 'https://example.test/nl/' ],
			[ 'https://example.test/?s=x', 'nl', 'https://example.test/nl/?s=x' ],
			[ 'https://example.test/about/#top', 'nl', 'https://example.test/nl/about/#top' ],
			[ 'https://example.test/nl/about/', 'nl', 'https://example.test/nl/about/' ],
			[ 'https://example.test/nl/about/', '', 'https://example.test/about/' ],
			[ 'https://example.test/about/', '', 'https://example.test/about/' ],
			[ 'https://example.test/wp-admin/admin-ajax.php', 'nl', 'https://example.test/wp-admin/admin-ajax.php' ],
			[ 'https://example.test/wp-json/blixis/v1/status', 'nl', 'https://example.test/wp-json/blixis/v1/status' ],
			[ 'https://example.test/?rest_route=/blixis/v1/status', 'nl', 'https://example.test/?rest_route=/blixis/v1/status' ],
			[ 'https://example.test/wp-content/uploads/a.png', 'nl', 'https://example.test/wp-content/uploads/a.png' ],
			[ 'https://example.test/wp-login.php?x=1', 'nl', 'https://example.test/wp-login.php?x=1' ],
			[ 'https://other.test/about/', 'nl', 'https://other.test/about/' ],
			[ 'https://example.test.evil.test/about/', 'nl', 'https://example.test.evil.test/about/' ],
			[ 'https://example.testabout/', 'nl', 'https://example.testabout/' ],
		];
		foreach ( $cases as [ $url, $prefix, $expected ] ) {
			$this->assertSame( $expected, RoutePath::localize_url( $url, $home, $prefix, $config ), $url . ' -> ' . $prefix );
		}
		$this->assertSame( 'https://example.test/blog/nl/about/', RoutePath::localize_url( 'https://example.test/blog/about/', 'https://example.test/blog', 'nl', $config ) );
	}

	/** Reserved routes and existing slugs block a prefix. */
	public function test_collisions(): void {
		$config = LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'nl_NL', 'fr_FR' ],
			],
			'en_US'
		);
		$this->assertSame( [], Collisions::report( $config, [ 'about', 'contact' ] ) );
		$this->assertSame(
			[
				[
					'locale' => 'nl_NL',
					'prefix' => 'nl',
					'reason' => 'existing-slug',
				],
			],
			Collisions::report( $config, [ 'About', 'NL' ] )
		);
		$feed = LocaleConfig::from_option(
			[
				'version'        => 1,
				'defaultLocale'  => 'en_US',
				'enabledLocales' => [ 'en_US', 'xml_XX' ],
			],
			'en_US'
		);
		$this->assertSame( [], Collisions::report( $feed, [] ) );
		$this->assertTrue( RoutePath::is_reserved( '/wp-admin/' ) );
		$this->assertTrue( RoutePath::is_reserved( '/WP-JSON/x' ) );
		$this->assertFalse( RoutePath::is_reserved( '/nl/' ) );
	}

	/** Direction follows the language, including regional RTL tags. */
	public function test_direction(): void {
		foreach ( [ 'ar', 'he_IL', 'fa_IR', 'ur', 'ckb', 'az_IR' ] as $rtl ) {
			$this->assertSame( 'rtl', Direction::dir( $rtl ), $rtl );
		}
		foreach ( [ 'en_US', 'nl_NL', 'az', 'ja', 'zh_CN', 'de_DE' ] as $ltr ) {
			$this->assertSame( 'ltr', Direction::dir( $ltr ), $ltr );
		}
	}

	/** The hreflang alternates cover published locales plus an x-default that is itself published. */
	public function test_alternates(): void {
		$this->assertSame( [], Alternates::links( [], 'en_US' ) );
		$both = Alternates::links(
			[
				'en_US' => 'https://e.test/a/',
				'nl_NL' => 'https://e.test/nl/a/',
			],
			'en_US'
		);
		$this->assertSame(
			[
				[
					'hreflang' => 'en-US',
					'href'     => 'https://e.test/a/',
				],
				[
					'hreflang' => 'nl-NL',
					'href'     => 'https://e.test/nl/a/',
				],
				[
					'hreflang' => 'x-default',
					'href'     => 'https://e.test/a/',
				],
			],
			$both
		);
		$only_nl = Alternates::links( [ 'nl_NL' => 'https://e.test/nl/a/' ], 'en_US' );
		$this->assertSame( 'https://e.test/nl/a/', $only_nl[1]['href'], 'x-default falls back to the first published locale' );
	}

	/** The switcher needs two languages, escapes everything and marks the current one. */
	public function test_switcher(): void {
		$this->assertSame( '', Switcher::html( [ 'en_US' => 'https://e.test/a/' ], 'en_US', 'Language' ) );
		$html = Switcher::html(
			[
				'en_US' => 'https://e.test/a/',
				'nl_NL' => 'https://e.test/nl/a/?x="><script>',
			],
			'nl_NL',
			'Lang"uage'
		);
		$this->assertStringContainsString( 'aria-label="Lang&quot;uage"', $html );
		$this->assertSame( 1, \substr_count( $html, 'aria-current="page"' ) );
		$this->assertStringNotContainsString( '<script>', $html );
		$this->assertStringContainsString( 'hreflang="nl-NL" lang="nl-NL" aria-current="page"', $html );
	}

	/** The fallback policy decides what a missing translation shows: the source text or nothing. */
	public function test_fallback_policy(): void {
		$document = \json_decode(
			(string) \json_encode(
				[
					'defaultLocale' => 'en_US',
					'root'          => [
						[
							'id'       => 'hed-1',
							'type'     => 'blixis/heading',
							'props'    => [ 'level' => 2 ],
							'children' => [],
						],
					],
					'translations'  => [
						'en_US' => [
							'hed-1' => [
								'status' => 'translated',
								'values' => [ 'text' => 'Hello' ],
							],
						],
						'nl_NL' => new \stdClass(),
					],
				]
			)
		);
		$this->assertInstanceOf( \stdClass::class, $document );
		$renderer = new \Blixis\Builder\Render\CoreDocumentRenderer(
			\Blixis\Builder\Registry\ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ),
			new class() implements \Blixis\Builder\Render\MediaResolver {
				/**
				 * No media.
				 *
				 * @param int $attachment_id Attachment id.
				 * @return array{url:string,width:int,height:int,alt:string}|null
				 */
				public function resolve( int $attachment_id ): ?array {
					unset( $attachment_id );
					return null;
				}
			}
		);
		$this->assertStringContainsString( '>Hello</h2>', $renderer->render( $document, 'nl_NL', 'light' ), 'source policy shows the default locale text' );
		$this->assertStringContainsString( '></h2>', $renderer->render( $document, 'nl_NL', 'light', [], 'blank' ), 'blank policy shows nothing' );
		$this->assertStringContainsString( '>Hello</h2>', $renderer->render( $document, 'en_US', 'light', [], 'blank' ), 'a present translation always wins' );
	}
}
