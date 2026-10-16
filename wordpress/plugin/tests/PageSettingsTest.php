<?php
/** Page settings storage and token contract tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Publication\AuditEvent;
use Blixis\Builder\Rest\PageSettingsRequest;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\MetaRegistration;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/Fixtures/WpPost.php';
require_once __DIR__ . '/FakePostAccess.php';

/** Page settings metadata and concurrency token contracts. */
final class PageSettingsTest extends TestCase {
	/** Set up a current post for write policy checks. */
	protected function setUp(): void {
		\WP_Post::$page_settings_post        = new \WP_Post(
			(object) [
				'ID'                => 42,
				'post_type'         => 'page',
				'post_status'       => 'publish',
				'post_modified_gmt' => '2026-10-16 10:00:00',
			]
		);
		\WP_Post::$page_settings_write_count = 0;
	}

	/** SEO metadata is a single schema-versioned envelope and not a core REST field. */
	public function test_seo_meta_envelope_is_registered_as_protected_data(): void {
		$this->assertTrue( MetaKeys::is_valid_key( MetaKeys::SEO ) );
		$this->assertSame( '{"schemaVersion":1,"locales":{}}', MetaRegistration::sanitize_seo( '{"schemaVersion":1,"locales":{}}' ) );
		$this->assertSame( '', MetaRegistration::sanitize_seo( '{"schemaVersion":2,"locales":{}}' ) );
		$this->assertSame( '{"schemaVersion":1,"locales":{}}', MetaRegistration::sanitize_seo( '{"schemaVersion":1,"locales":[]}' ) );
		$this->assertSame( '', MetaRegistration::sanitize_seo( '{"schemaVersion":1,"locales":["x"]}' ) );
		// Direct meta writes are normalised: markup is stripped and an off-site canonical is dropped.
		$hostile = MetaRegistration::sanitize_seo( '{"schemaVersion":1,"locales":{"en_US":{"metaTitle":"</title><script>alert(1)</script>Hi","canonical":"https://evil.test/x"}}}' );
		$this->assertStringNotContainsString( '<script', $hostile );
		$this->assertStringNotContainsString( 'evil.test', $hostile );
	}

	/** Page settings versions derive from the write counter, post_modified_gmt and post ID. */
	public function test_version_token_changes_with_post_identity_or_modified_time(): void {
		$method = new \ReflectionMethod( PageSettingsRequest::class, 'version' );
		$a      = new \WP_Post(
			(object) [
				'post_modified_gmt' => '2026-10-16 10:00:00',
				'ID'                => 42,
			]
		);
		$b      = new \WP_Post(
			(object) [
				'post_modified_gmt' => '2026-10-16 10:00:00',
				'ID'                => 43,
			]
		);
		$c      = new \WP_Post(
			(object) [
				'post_modified_gmt' => '2026-10-16 10:00:01',
				'ID'                => 42,
			]
		);
		$this->assertSame( \sha1( ':2026-10-16 10:00:00:42' ), $method->invoke( null, $a ) );
		$this->assertNotSame( $method->invoke( null, $a ), $method->invoke( null, $b ) );
		$this->assertNotSame( $method->invoke( null, $a ), $method->invoke( null, $c ) );
		// Two writes inside one second leave post_modified_gmt unchanged: the counter alone must move the token.
		$before = $method->invoke( null, $a );
		\update_post_meta( 42, MetaKeys::PAGE_VERSION, '1' );
		$after_first = $method->invoke( null, $a );
		\update_post_meta( 42, MetaKeys::PAGE_VERSION, '2' );
		$after_second = $method->invoke( null, $a );
		$this->assertNotSame( $before, $after_first );
		$this->assertNotSame( $after_first, $after_second );
		unset( $GLOBALS['blixis_test_post_meta'] );
	}

	/** The write counter only ever stores a bounded integer string. */
	public function test_write_counter_sanitiser_accepts_only_bounded_integers(): void {
		$this->assertSame( '7', MetaRegistration::sanitize_counter( 7 ) );
		$this->assertSame( '7', MetaRegistration::sanitize_counter( '7' ) );
		foreach ( [ '', '-1', '1.5', 'abc', '1e3', '9999999999999', [], null ] as $bad ) {
			$this->assertSame( '0', MetaRegistration::sanitize_counter( $bad ) );
		}
	}

	/** Page settings audit reuses the content-free publication event envelope. */
	public function test_page_settings_audit_event_contains_no_page_content(): void {
		$event = new AuditEvent( 7, 42, null, 'page-settings', null, null, 0, 0 );
		$this->assertSame(
			[ 'actor', 'post', 'locale', 'kind', 'layoutSnapshot', 'contentSnapshot', 'pointerRevision', 'time' ],
			\array_keys( $event->data() )
		);
		$this->assertSame( 'page-settings', $event->data()['kind'] );
	}

	/** Preconditions and full-body validation reject requests before any write call. */
	public function test_missing_stale_and_invalid_updates_are_atomic(): void {
		$request = new PageSettingsRequest( new FakePostAccess() );
		$version = \sha1( ':2026-10-16 10:00:00:42' );
		$this->assertSame( 428, $request->put( 42, null, '{"title":"New"}', 7 )->status );
		$this->assertSame( 409, $request->put( 42, '"stale"', '{"title":"New"}', 7 )->status );
		$unknown = $request->put( 42, '"' . $version . '"', '{"metaKey":"_arbitrary"}', 7 );
		$this->assertSame( 400, $unknown->status );
		$this->assertSame( 'blixis_invalid_page_settings', $unknown->error_code );
		$long = $request->put( 42, '"' . $version . '"', '{"title":"' . \str_repeat( 'x', 201 ) . '"}', 7 );
		$this->assertSame( 400, $long->status );
		$this->assertSame( 0, \WP_Post::$page_settings_write_count );
	}

	/** Invalid payloads never reach the post write boundary.
	 *
	 * @param string $body Request JSON.
	 */
	#[DataProvider( 'invalid_payloads' )]
	public function test_validation_rejects_hostile_payloads_atomically( string $body ): void {
		$request = new PageSettingsRequest( new FakePostAccess() );
		$version = \sha1( ':2026-10-16 10:00:00:42' );
		$result  = $request->put( 42, '"' . $version . '"', $body, 7 );
		$this->assertSame( 400, $result->status );
		$this->assertSame( 0, \WP_Post::$page_settings_write_count );
	}

	/** Provide invalid request bodies across top-level, text, locale and URL rules.
	 *
	 * @return array<string, array{string}>
	 */
	public static function invalid_payloads(): array {
		return [
			'unknown top-level key'                    => [ '{"title":"Safe","metaKey":"_arbitrary"}' ],
			'unknown SEO key'                          => [ '{"seo":{"en_US":{"extra":"x"}}}' ],
			'disabled locale'                          => [ '{"seo":{"fr_FR":{"metaTitle":"x"}}}' ],
			'hostile unknown SEO key'                  => [ '{"seo":{"en_US":{"\"><script>alert(1)</script>":"x"}}}' ],
			'nul control character'                    => [ '{"title":"bad\\u0000value"}' ],
			'overlong title'                           => [ '{"title":"' . \str_repeat( 'x', 201 ) . '"}' ],
			'overlong SEO title'                       => [ '{"seo":{"en_US":{"metaTitle":"' . \str_repeat( 'x', 121 ) . '"}}}' ],
			'javascript canonical'                     => [ '{"seo":{"en_US":{"canonical":"javascript:alert(1)"}}}' ],
			'data canonical'                           => [ '{"seo":{"en_US":{"canonical":"data:text/html,bad"}}}' ],
			'protocol-relative canonical'              => [ '{"seo":{"en_US":{"canonical":"//evil.test/path"}}}' ],
			'foreign-host canonical'                   => [ '{"seo":{"en_US":{"canonical":"https://evil.test/path"}}}' ],
			'credential canonical'                     => [ '{"seo":{"en_US":{"canonical":"https://user@example.test/path"}}}' ],
			'fragment canonical'                       => [ '{"seo":{"en_US":{"canonical":"https://example.test/path#frag"}}}' ],
			'quote script plain field remains bounded' => [ '{"unexpected":"\"><script>alert(1)</script>"}' ],
		];
	}
}
