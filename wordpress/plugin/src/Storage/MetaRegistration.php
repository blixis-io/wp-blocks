<?php
/**
 * Builder meta registration and capability boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Registers fixed keys and scopes dynamic-key meta capabilities. */
final class MetaRegistration {
	/**
	 * Install runtime hooks, called by Plugin::register().
	 */
	public static function hooks(): void {
		\add_action( 'init', [ self::class, 'register' ] );
		\add_filter( 'map_meta_cap', [ self::class, 'map_meta_cap' ], 10, 4 );
		\add_filter( 'wp_post_revision_meta_keys', [ self::class, 'revision_meta_keys' ], 10, 2 );
	}

	/** Register fixed post meta per opted-in public post type. */
	public static function register(): void {
		foreach ( self::post_types() as $post_type ) {
			foreach ( [ MetaKeys::LAYOUT, MetaKeys::PUBLISHED ] as $key ) {
				\register_post_meta(
					$post_type,
					$key,
					[
						'single'            => true,
						'type'              => 'string',
						'show_in_rest'      => false,
						'auth_callback'     => [ self::class, 'authorize' ],
						'sanitize_callback' => [ self::class, 'sanitize' ],
					]
				);
			}
		}
	}

	/**
	 * Resolve allowed editable post types.
	 *
	 * @return list<string> Allowed post types.
	 */
	private static function post_types(): array {
		$candidates = \apply_filters( 'blixis_builder_post_types', [ 'post', 'page' ] );
		if ( ! \is_array( $candidates ) ) {
			return [];
		}
		$allowed = [];
		foreach ( $candidates as $post_type ) {
			if ( ! \is_string( $post_type ) || ! \post_type_exists( $post_type ) ) {
				continue;
			}
			$object = \get_post_type_object( $post_type );
			if ( null !== $object && ( $object->public ?? false ) && ( $object->show_in_rest ?? false ) ) {
				$allowed[] = $post_type;
			}
		}
		return \array_values( \array_unique( $allowed ) );
	}

	/**
	 * Registered fixed keys require the post's edit capability.
	 *
	 * @param bool   $allowed Value.
	 * @param string $key Value.
	 * @param int    $post_id Value.
	 */
	public static function authorize( bool $allowed, string $key, int $post_id ): bool {
		return MetaKeys::is_valid_key( $key ) && \in_array( \get_post_type( $post_id ), self::post_types(), true ) && \current_user_can( 'edit_post', $post_id );
	}

	/**
	 * Invalid fixed-key input becomes an empty string. WordPress does not let a
	 * sanitize callback abort a meta write; the repository must validate before
	 * writing, and callers must not use update_post_meta for builder streams.
	 *
	 * @param mixed  $value Value.
	 * @param string $key Value.
	 */
	public static function sanitize( mixed $value, string $key ): string {
		if ( ! \is_string( $value ) || ! MetaKeys::is_valid_key( $key ) ) {
			return '';
		}
		return ( new EnvelopeValidator() )->accepts( $value, $key ) ? $value : '';
	}

	/**
	 * Protected dynamic keys have no register_post_meta entry. Intercept only
	 * their meta capability checks, preserving edit_post's normal mapping.
	 *
	 * @param array<string> $caps Primitive capabilities.
	 * @param string        $cap  Requested capability.
	 * @param int           $user_id User ID.
	 * @param array<mixed>  $args Capability arguments.
	 * @return array<string> Required primitive capabilities.
	 */
	public static function map_meta_cap( array $caps, string $cap, int $user_id, array $args ): array {
		if ( ! \in_array( $cap, [ 'add_post_meta', 'edit_post_meta', 'delete_post_meta' ], true ) || ! isset( $args[1] ) || ! \is_string( $args[1] ) || 0 !== \strpos( $args[1], '_blixis_' ) ) {
			return $caps;
		}
		$key     = $args[1];
		$post_id = isset( $args[0] ) ? (int) $args[0] : 0;
		if ( $post_id < 1 || ! MetaKeys::is_valid_key( $key ) || ! \in_array( \get_post_type( $post_id ), self::post_types(), true ) ) {
			return [ 'do_not_allow' ];
		}
		if ( ! MetaKeys::is_snapshot( $key ) && MetaKeys::LAYOUT !== $key && MetaKeys::PUBLISHED !== $key ) {
			return \map_meta_cap( 'edit_post', $user_id, $post_id );
		}
		if ( MetaKeys::is_snapshot( $key ) ) {
			return \map_meta_cap( 'edit_post', $user_id, $post_id );
		}
		return $caps;
	}

	/**
	 * Core revisions/autosaves never copy or restore builder-owned streams.
	 *
	 * @param array<string> $keys      Revisioned keys.
	 * @param string        $post_type Post type supplied by core.
	 * @return list<string> Non-builder revisioned keys.
	 */
	public static function revision_meta_keys( array $keys, string $post_type ): array {
		if ( ! \in_array( $post_type, self::post_types(), true ) ) {
			return \array_values( $keys );
		}
		return \array_values( \array_filter( $keys, static fn ( mixed $key ): bool => ! \is_string( $key ) || 0 !== \strpos( $key, '_blixis_' ) ) );
	}
}
