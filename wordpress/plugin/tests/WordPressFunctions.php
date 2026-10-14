<?php
/**
 * Minimal WordPress activation fixtures for BWB-039.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

/**
 * Mimic add_option's create-only behavior.
 *
 * @param string $option     Option name.
 * @param mixed  $value      Option value.
 * @param string $deprecated Unused WordPress argument.
 * @param bool   $autoload   Autoload flag.
 * @return bool Whether the option was added.
 */
function add_option( string $option, mixed $value, string $deprecated = '', bool $autoload = true ): bool {
	FakeOptions::$calls[] = [ FakeOptions::$current, $option, $value, $deprecated, $autoload ];
	if ( \array_key_exists( $option, FakeOptions::$sites[ FakeOptions::$current ] ?? [] ) ) {
		return false;
	}
	FakeOptions::$sites[ FakeOptions::$current ][ $option ] = $value;
	return true;
}

/** Report whether this fixture is a multisite network. */
function is_multisite(): bool {
	return FakeOptions::$multisite;
}

/**
 * Return the fixture's site IDs.
 *
 * @param array<string, int|string> $args Query arguments.
 * @return list<int>
 * @throws \InvalidArgumentException On an unexpected query.
 */
function get_sites( array $args ): array {
	if ( [
		'fields' => 'ids',
		'number' => 0,
	] !== $args ) {
		throw new \InvalidArgumentException( 'Unexpected site query.' );
	}
	return \array_keys( FakeOptions::$sites );
}
/**
 * Enter another site's option context.
 *
 * @param int $site_id Site ID.
 * @return void
 */
function switch_to_blog( int $site_id ): void {
	FakeOptions::$stack[] = FakeOptions::$current;
	FakeOptions::$current = $site_id;
}

/** Return to the previous site's option context. */
function restore_current_blog(): void {
	FakeOptions::$current = (int) \array_pop( FakeOptions::$stack );
}
