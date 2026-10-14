<?php
/**
 * WordPress registration boundary tests for BWB-040.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

use Blixis\Builder\Autoloader;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/HookState.php';
require_once __DIR__ . '/StorageWordPressFunctions.php';

/** Registration, sanitization and dynamic-key capability checks. */
final class MetaRegistrationTest extends TestCase {
	/** Clear captured hook state. */
	protected function setUp(): void {
		HookState::$actions  = [];
		HookState::$filters  = [];
		HookState::$meta     = [];
		HookState::$can_edit = true;
	}

	/** Only the two fixed keys are registered per default post type. */
	public function test_fixed_registration_and_hooks(): void {
		MetaRegistration::hooks();
		$this->assertCount( 1, HookState::$actions['init'] );
		$this->assertCount( 1, HookState::$filters['map_meta_cap'] );
		$this->assertCount( 1, HookState::$filters['wp_post_revision_meta_keys'] );
		MetaRegistration::register();
		$this->assertCount( 4, HookState::$meta );
		$this->assertSame( [ 'post', MetaKeys::LAYOUT ], \array_slice( HookState::$meta[0], 0, 2 ) );
		$this->assertSame( [ 'page', MetaKeys::PUBLISHED ], \array_slice( HookState::$meta[3], 0, 2 ) );
		$this->assertSame( false, HookState::$meta[0][2]['show_in_rest'] );
		$this->assertSame( 'string', HookState::$meta[0][2]['type'] );
		$this->assertSame( true, HookState::$meta[0][2]['single'] );
	}

	/** Invalid fixed input is emptied; authorization requires edit_post. */
	public function test_sanitize_and_authorize(): void {
		$this->assertSame( '', MetaRegistration::sanitize( '{', MetaKeys::LAYOUT ) );
		$this->assertSame( '', MetaRegistration::sanitize( [], MetaKeys::LAYOUT ) );
		$value = '{"schemaVersion":1,"layoutRevision":1}';
		$this->assertSame( $value, MetaRegistration::sanitize( $value, MetaKeys::LAYOUT ) );
		$this->assertTrue( MetaRegistration::authorize( false, MetaKeys::LAYOUT, 5 ) );
		HookState::$can_edit = false;
		$this->assertFalse( MetaRegistration::authorize( true, MetaKeys::LAYOUT, 5 ) );
	}

	/** Only valid builder meta capabilities map to edit_post. */
	public function test_dynamic_meta_and_core_revision_policy(): void {
		$this->assertSame( [ 'edit_posts' ], MetaRegistration::map_meta_cap( [ 'do_not_allow' ], 'edit_post_meta', 2, [ 5, MetaKeys::content( 'nl_NL' ) ] ) );
		$this->assertSame( [ 'do_not_allow' ], MetaRegistration::map_meta_cap( [ 'edit_posts' ], 'edit_post_meta', 2, [ 5, '_blixis_content_../bad' ] ) );
		$this->assertSame( [ 'edit_posts' ], MetaRegistration::map_meta_cap( [ 'edit_posts' ], 'edit_post_meta', 2, [ 5, 'other_meta' ] ) );
		$this->assertSame( [ 'normal' ], MetaRegistration::revision_meta_keys( [ MetaKeys::LAYOUT, MetaKeys::content( 'nl_NL' ), 'normal' ], 'post' ) );
	}
}
